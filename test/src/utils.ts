import {
  C,
  Constr,
  Data,
  Lucid,
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
  type Result = {
    label: string
    error?: string | Error
    mismatch?: boolean
    tx?: Tx
    status: Status
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
        await tx.complete()
          .then(tx => tx.sign().complete())
          .then(tx => expected === 'Success' ? tx.submit() : undefined)
          .then(txHash => txHash ? lucid.awaitTx(txHash) : false)
          .then(() => {
            if (expected !== 'Fail') {
              results.push({ label, status: 'Success', tx })
            } else {
              results.push({ label, status: 'Fail', tx })
            }
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

  const logResults = () => {
    const total = results.length
    let successes = 0
    let skipped = 0
    for (const result of results) {
      const indent = '         '
      // NOTE: the printed status represents the transaction's success, 
      // `result.status` is the status of the test case
      //
      // these two statuses will disagree in cases where failure is expected
      const statusMap: { [status in Status]: string } = {
        'Fail': result.error ? '\x1b[31m   FAIL' : '\x1b[31mSUCCESS',
        'Success': result.error ? '\x1b[92m   FAIL' : '\x1b[92mSUCCESS',
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
