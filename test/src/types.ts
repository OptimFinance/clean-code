import {
  Address,
  Assets,
  C,
  Credential,
  Data,
  Datum,
  KeyHash,
  Lucid,
  Redeemer,
  RewardAddress,
  Script,
  ScriptHash,
  TxComplete,
  Utils,
  UTxO,
} from 'lucid';
import * as L from 'lucid';
import { Schema,SchemaToType,fromPlutusData,toPlutusData } from "./schema.ts";

export type BlueprintScript = {
  title: string
  redeemer?: unknown
  datum?: unknown
  parameters: {
      title: string
      schema: {
          $ref: string
      };
  }[];
  compiledCode: string
  hash: string
}

export type Blueprint = {
  validators: BlueprintScript[]
}

export type Validator = BlueprintScript & {
  validator: Script,
  mkAddress: (stakeCredential?: Credential) => Address
  mkRewardAddress: (stakeCredential?: Credential) => Address
  hash: ScriptHash
}

export type ScriptType = 'spend' | 'mint' | 'withdraw' | 'mint_withdraw'
export const scriptTypes: ScriptType[] = [ 'spend', 'mint', 'withdraw', 'mint_withdraw' ]

type Input = {
  utxo: UTxO
  redeemer?: Data
}

type Mint = {
  assets: Assets
  redeemer?: Data
}

type Output = {
  address: Address
  datum?: Data
  assets: Assets
}

type Withdrawal = {
  address: RewardAddress
  amount: bigint
  redeemer?: Data
}

export class Tx {
  lucid: Lucid
  utils: Utils
  tx: L.Tx

  inputs: Input[] = []
  mints: Mint[] = []
  outputs: Output[] = []
  referenceInputs: Input[] = []
  withdrawals: Withdrawal[] = []
  signatories: KeyHash[] = []
  preComplete: (_: L.Tx) => L.Tx = v=>v
  postComplete: (_: TxComplete) => Promise<TxComplete> = async v => v

  constructor(lucid: Lucid) {
    this.lucid = lucid
    this.utils = new Utils(lucid)
    this.tx = this.lucid.newTx()
  }

  collectFrom(utxos: UTxO[], redeemer?: Redeemer) {
    utxos.forEach(utxo => this.inputs.push({
      utxo,
      redeemer: redeemer ? Data.from(redeemer) : undefined
    }))
    return this
  }

  mintAssets(assets: Assets, redeemer?: Redeemer) {
    this.mints.push({
      assets,
      redeemer: redeemer ? Data.from(redeemer) : undefined
    })
    return this
  }

  addOutput(address: Address, assets: Assets, datum?: Data) {
    this.outputs.push({ address, assets, datum })
    return this
  }

  payToAddressWithData(address: Address, data: { inline: Datum }, assets: Assets) {
    return this.addOutput(address, assets, Data.from(data.inline))
  }

  payToAddress(address: Address, assets: Assets) {
    return this.addOutput(address, assets)
  }

  payToContract(address: Address, data: { inline: Datum }, assets: Assets) {
    return this.addOutput(address, assets, Data.from(data.inline))
  }

  withdraw(address: RewardAddress, amount: bigint, redeemer?: Redeemer) {
    this.withdrawals.push({
      address,
      amount,
      redeemer: redeemer ? Data.from(redeemer) : undefined 
    })
    return this
  }

  readFrom(utxos: UTxO[]) {
    utxos.forEach(utxo => this.referenceInputs.push({ utxo }))
    return this
  }

  addSignerKey(keyHash: KeyHash) {
    this.signatories.push(keyHash)
    return this
  }

  signWithPrivateKey(key: C.PrivateKey) {
    this.addPostComplete(async tx => tx.signWithPrivateKey(key.to_bech32()))
    return this
  }

  compose = (other: Tx) => {
    this.tx.compose(other.tx)
    this.inputs.push(...other.inputs)
    this.mints.push(...other.mints)
    this.outputs.push(...other.outputs)
    this.referenceInputs.push(...other.referenceInputs)
    this.signatories.push(...other.signatories)
    this.addPreComplete(other.preComplete)
    this.addPostComplete(other.postComplete)
    return this
  }

  attachMintingPolicy(script: Script) {
    this.tx.attachMintingPolicy(script)
    return this
  }

  attachSpendingValidator(script: Script) {
    this.tx.attachSpendingValidator(script)
    return this
  }

  attachWithdrawalValidator(script: Script) { 
    this.tx.attachWithdrawalValidator(script)
    return this
  }

  removeSignerKey(keyHash: KeyHash) {
    const ix = this.signatories.indexOf(keyHash)
    if (ix >= 0)
      this.signatories.splice(ix, 1)
    return this
  }

  registerStake(address: RewardAddress) { 
    this.tx.registerStake(address)
    return this
  }
  
  validFrom(unixTime: number) {
    this.tx.validFrom(unixTime)
    return this
  }

  validTo(unixTime: number) {
    this.tx.validTo(unixTime)
    return this
  }

  removeInputByNft(nftUnit: string) {
    const ix = this.inputs.findIndex(input => input.utxo.assets[nftUnit] == 1n)
    if (ix >= 0)
      this.inputs.splice(ix, 1)
    return this
  }

  removeOutputByNft(nftUnit: string) {
    const ix = this.outputs.findIndex(output => output.assets[nftUnit] == 1n)
    if (ix >= 0)
      this.outputs.splice(ix, 1)
    return this
  }

  transformOutputDatumByNft(nftUnit: string, f: (_: Data | undefined) => Data | undefined) {
    const output = this.outputs.find(output => output.assets[nftUnit] == 1n)
    if (output)
      output.datum = f(output.datum)
    return this
  }

  transformOutputAssetsByNft(nftUnit: string, f: (_: Assets) => Assets) {
    const output = this.outputs.find(output => output.assets[nftUnit] == 1n)
    if (output)
      output.assets = f(output.assets)
    return this
  }

  transformOutputAssetsByScriptHash(scriptHash: string, f: (_: Assets) => Assets) {
    const outputs = this.outputs.filter(output => {
      const {paymentCredential} = this.utils.getAddressDetails(output.address)
      return paymentCredential!.type === 'Script' && 
        paymentCredential!.hash === scriptHash
    })
    outputs.forEach(output => output.assets = f(output.assets))
    return this
  }

  addPreComplete(f: (_: L.Tx) => L.Tx) {
    const prev = this.preComplete
    this.preComplete = tx => f(prev(tx))
    return this
  }

  addPostComplete(f: (_: TxComplete) => Promise<TxComplete>) {
    const prev = this.postComplete
    this.postComplete = tx => prev(tx).then(f)
    return this
  }

  async complete() {
    this.inputs.forEach(input =>
      this.tx.collectFrom(
        [input.utxo],
        input.redeemer ? Data.to(input.redeemer) : undefined
      )
    )
    this.mints.forEach(mint =>
      this.tx.mintAssets(
        mint.assets,
        mint.redeemer ? Data.to(mint.redeemer) : undefined
      )
    )
    this.outputs.forEach(output => {
      this.tx.payToAddressWithData(
        output.address,
        { inline: output.datum ? Data.to(output.datum) : undefined },
        output.assets
      )
    })
    this.referenceInputs.forEach(input => {
      this.tx.readFrom([input.utxo])
    })
    this.withdrawals.forEach(withdrawal => {
      this.tx.withdraw(
        withdrawal.address,
        withdrawal.amount,
        withdrawal.redeemer ? Data.to(withdrawal.redeemer) : undefined
      )
    })
    this.signatories.forEach(signatory => {
      this.tx.addSignerKey(signatory)
    })
    return await this.preComplete(this.tx).complete().then(this.postComplete)
  }
}

export const transformOutputDatumByNft =
  <S extends Schema>(schema: S, nftUnit: string) =>
  (f: (n: SchemaToType<S>) => SchemaToType<S>) => (tx: Tx): Tx => {
    return tx.transformOutputDatumByNft(nftUnit, data => {
      const datum: SchemaToType<S> = fromPlutusData(schema, data!)
      return toPlutusData(f(datum))
    })
  }

export const transformOutputDatumFieldByNft =
  <S extends Schema>(schema: Schema, nftUnit: string) =>
  <F extends keyof SchemaToType<S>>(
    field: F,
    f: (n: SchemaToType<S>[F]) => SchemaToType<S>[F]
  ) => (tx: Tx): Tx => {
    return tx.transformOutputDatumByNft(nftUnit, data => {
      const datum: SchemaToType<S> = fromPlutusData(schema, data!)
      datum[field] = f(datum[field])
      return toPlutusData(datum)
    })
  }
