import {
  C,
  Constr,
  Data,
  Lucid,
  PROTOCOL_PARAMETERS_DEFAULT,
  Script,
  TxComplete,
  Utils,
  applyParamsToScript,
} from 'lucid';
import * as L from 'lucid';
import {
  Blueprint,
  Tx,
  Validator,
  scriptTypes
} from './types.ts';

export const wrapRedeemer = (redeemer: Data) => new Constr(1, [redeemer])

export const handleError = (err: Error) => {
  console.error(new Error().stack, err)
  throw err
}

export const id = <T>(v: T) => v
export const const_ = <T>(x: T) => (_: unknown) => x
export const asyncId = async <T>(v: T) => await v

export const addSignature = (privateKey: C.PrivateKey) =>
  (tx: Tx) => tx.signWithPrivateKey(privateKey)

export const withTrace = (trace: string) => (error: string | Error) => 
  typeof(error) === 'string' && error.includes(trace)

export const mkScriptUtils = (lucid: Lucid) => {
  type Status = 'Success' | 'Fail' | 'Skipped' | 'Ignored'
  type TxMetrics = {
    exUnits: { cpu: number, mem: number } | null
    size: number
  } 
  type Result = {
    label: string
    error?: string | Error
    extraLog?: string
    mismatch?: boolean
    tx?: Tx
    status: Status
    txMetrics?: TxMetrics
  }

  const results: Result[] = []
  const utils = new Utils(lucid)

  const loadValidator = (
    blueprint: Blueprint,
    name: string,
    parameters: Data[] = []
  ): Validator => {
    for (const s of scriptTypes) {
      const script = blueprint.validators.find(v => v.title === `${name}.${s}`)
      if (!script)
        continue;
      const validator: Script = { type: 'PlutusV2', script: applyParamsToScript(script.compiledCode, parameters) }
      return {
        ...script,
        validator,
        mkAddress: (stakeCredential) => utils.validatorToAddress(validator, stakeCredential),
        mkRewardAddress: () => utils.validatorToRewardAddress(validator),
        hash: utils.validatorToScriptHash(validator)
      }
    }
    throw new Error(`No script found for ${name}`)
  }

  const functionLabel = (f: Function) => {
    const body = f.toString().replace('()=>', '').replace(/function .+{\s*(.+)\s*}/, '$1')
    return body
  }

  type BuildTx = () => Promise<Tx>
  type TestCase = BuildTx | {
    case: BuildTx
    label?: string
    expect?: Status
    extraLog?: () => Promise<string>
    matchError?: (_: string | Error) => boolean
    preComplete?: <T extends Tx | L.Tx>(tx: T) => Promise<T>,
    postComplete?: (tx: TxComplete) => Promise<TxComplete>,
  }
  const sequenceTransactions =
    async (testCases: TestCase[], options: { keepGoing?: boolean } = {}): Promise<void> => {
      const keepGoing = options.keepGoing ?? false
      let stillGoing = true
      let firstError = null
      for (const c of testCases) {
        const testCase = typeof(c) === 'function' ? { case: c } : c
        const label = testCase.label ?? functionLabel(testCase.case)
        const matchError = testCase.matchError ?? (() => true)
        const expected = testCase.expect ?? 'Success'
        if (!stillGoing && expected === 'Success') {
          results.push({ label, status: 'Skipped' })
          continue
        }
        if (expected === 'Ignored') {
          results.push({ label, status: 'Ignored' })
          continue
        }
        const tx = await testCase.case()
        const txMetrics: TxMetrics = { size: 0, exUnits: null }
        await tx.complete()
          .then(tx => {
            txMetrics.exUnits = tx.exUnits
            txMetrics.size = tx.toString().length / 2
            return tx.sign().complete()
          })
          .then(tx => expected === 'Success' ? tx.submit() : undefined)
          .then(txHash => txHash ? lucid.awaitTx(txHash) : false)
          .then(async () => {
            const extraLog =
              'extraLog' in c && c.extraLog
                ? await c.extraLog()
                : undefined
            let status: Status = 'Fail'
            if (expected !== 'Fail') {
              status = 'Success'
            }
            results.push({ label, status, tx, extraLog, txMetrics })
            return tx
          })
          .catch((error: string | Error) => {
            if (testCase.expect !== 'Fail') {
              stillGoing &&= keepGoing
              results.push({ label, error, status: 'Fail' })
              firstError = error
            } else if (!matchError(error)) {
              results.push({ label, error, status: 'Fail', mismatch: true })
            } else {
              results.push({ label, error, status: 'Success' })
            }
          })
      }
      if (firstError && !keepGoing)
        throw firstError
  }

  const logResults = (options: { alwaysPrintMetrics?: boolean } = {}) => {
    const alwaysPrintMetrics = options.alwaysPrintMetrics ?? false
    const total = results.length
    let successes = 0
    let skipped = 0
    const protocolParams = PROTOCOL_PARAMETERS_DEFAULT
    const indent = '         '
    for (const result of results) {
      // NOTE: the printed status represents the transaction's success, 
      // `result.status` is the status of the test case
      //
      // these two statuses will disagree in cases where failure is expected
      const statusMap: { [status in Status]: string } = {
        'Fail': '\x1b[31m' + (result.error ? '   FAIL' : 'SUCCESS'),
        'Success': '\x1b[92m' + (result.error ? '   FAIL' : 'SUCCESS'),
        'Skipped': '\x1b[33mSKIPPED',
        'Ignored': '\x1b[38;5;8mIGNORED',
      }
      const statusString = statusMap[result.status]

      console.log(
        `${statusString}\x1b[0m: ${result.label}`,
          result.mismatch ? '(error mismatch)' : ''
      )
      if (result.status === 'Fail') {
        if (result.error)
          console.log(`\n${result.error.toString().replace(/^/gm, indent)}\n`)
        else
          console.log(`${indent}Transaction was expected to fail\n`)
      } else if (result.status == 'Skipped') {
        skipped += 1
      } else {
        successes += 1
      }
      if (result.extraLog) {
        const extraLog = result.extraLog.split('\n').join(`\n${indent}`)
        console.log(`${indent}\x1b[35m${extraLog}\x1b[0m`)
      }
      if (result.txMetrics) {
        if (result.txMetrics.exUnits) {
          const cpuRatio = result.txMetrics.exUnits.cpu / Number(protocolParams.maxTxExSteps)
          const memRatio = result.txMetrics.exUnits.mem / Number(protocolParams.maxTxExMem)
          if (cpuRatio >= 1.0)
            console.log(`${indent}\x1b[31mTransaction used ${cpuRatio}x steps budget\x1b[0m`)
          else if (alwaysPrintMetrics)
            console.log(`${indent}\x1b[34mTransaction used ${cpuRatio}x steps budget\x1b[0m`)

          if (memRatio >= 1.0)
            console.log(`${indent}\x1b[31mTransaction used ${memRatio}x mem budget\x1b[0m`)
          else if (alwaysPrintMetrics)
            console.log(`${indent}\x1b[34mTransaction used ${memRatio}x mem budget\x1b[0m`)
        }
        const sizeRatio = result.txMetrics.size / Number(protocolParams.maxTxSize)
        if (sizeRatio >= 1.0)
          console.log(`${indent}\x1b[31mTransaction was ${sizeRatio}x max bytes\x1b[0m`)
        else if (alwaysPrintMetrics)
          console.log(`${indent}\x1b[34mTransaction was ${sizeRatio}x max bytes\x1b[0m`)
      }
    }
    console.log(`\n${successes}/${total} transactions succeeded, ${skipped} skipped\n`)
  }

  const getStatus = (): Status => {
    if (results.some(result => result.status == 'Fail'))
      return 'Fail'
    return 'Success'
  }

  return {
    loadValidator,
    sequenceTransactions,
    logResults,
    getStatus,
    newWallet
  }
}

export const newWallet = (lucid: Lucid) => {
  const utils = new Utils(lucid)
  const privateKey = C.PrivateKey.from_normal_bytes(crypto.getRandomValues(new Uint8Array(32)))
  const pubKeyHash = privateKey.to_public().hash().to_hex()
  const address = utils.credentialToAddress({ hash: pubKeyHash, type: 'Key' })
  return { privateKey, pubKeyHash, address }
}
