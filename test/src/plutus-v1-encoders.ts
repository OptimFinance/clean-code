import {Assets} from 'lucid'
import { 
  Encoder,
  SchemaToType,
  addTypeSchema,
  rawDataEncoder,
  bigintEncoder,
  listEncoder,
  validListEncoder,
  validMapEncoder,
  schemaEncoder,
  unionEncoder,
  validMapEncoder2
} from './schema.ts'

const falseSchema = {
  name: 'False' as const,
  constructor: 0n,
  fields: [] as const
}
addTypeSchema(falseSchema)
export type False = SchemaToType<typeof falseSchema>

const trueSchema = {
  name: 'True' as const,
  constructor: 1n,
  fields: [] as const
}
addTypeSchema(trueSchema)
export type True = SchemaToType<typeof trueSchema>

export type Boolean = False | True
export const booleanEncoder =
  unionEncoder<Boolean, ['False', 'True']>(['False', 'True'])

export const False: Boolean = { kind: 'False' }
export const True: Boolean = { kind: 'True' }

export type NonZero = bigint & { readonly NonZero: unique symbol }
const isNonZero = (n: bigint): n is NonZero => n !== 0n
const nonZero = (input: bigint): NonZero => {
  if (!isNonZero(input))
    throw new Error('Unexpected zero value')
  return input
}
export const nonZeroEncoder: Encoder<bigint, NonZero> =
  { name: 'bigint', validator: nonZero, proxy: null }

export type Natural = bigint & { readonly Natural: unique symbol }
const isNatural = (n: bigint): n is Natural => n >= 0n
const natural = (input: bigint): Natural => {
  if (!isNatural(input))
    throw new Error('Unexpected non-positive value')
  return input
}
export const naturalEncoder: Encoder<bigint, Natural> =
  { name: 'bigint', validator: natural, proxy: null }

export type Positive = bigint & { readonly Positive: unique symbol }
const isPositive = (n: bigint): n is Positive => n > 0n
const positive = (input: bigint): Positive => {
  if (!isPositive(input))
    throw new Error('Unexpected non-positive value')
  return input
}
export const positiveEncoder: Encoder<bigint, Positive> =
  { name: 'bigint', validator: positive, proxy: null }

type BSOfLength<N> = string & { readonly BSOfLength: unique symbol }
const isBSOfLength = <N extends number>(n: N, s: string): s is BSOfLength<N> =>
  new RegExp(`^[0-9A-Fa-f]{${n*2}}$`).test(s)
const bsOfLength = <N extends number>(n: N) => (input: string): BSOfLength<N> => {
  if (!isBSOfLength(n, input))
    throw new Error(`Invalid ${n}-byte bytestring`)
  return input
}
export const bsOfLengthEncoder = <N extends number>(n: N): Encoder<string, BSOfLength<N>> =>
  ({ name: 'string', validator: bsOfLength(n), proxy: null })

type BS28 = BSOfLength<28>
export const bs28Encoder: Encoder<string, BS28> = bsOfLengthEncoder(28)
type BS32 = BSOfLength<32>
export const bs32Encoder: Encoder<string, BS32> = bsOfLengthEncoder(32)

export type PubKeyHash = BS28
export const pubKeyHashEncoder = bs28Encoder
export type ScriptHash = BS28
export const scriptHashEncoder = bs28Encoder
export type ValidatorHash = BS28
export const validatorHashEncoder = bs28Encoder
export type MintingPolicyHash = BS28
export const mintingPolicyHashEncoder = bs28Encoder
export type DatumHash = BS32
export const datumHashEncoder = bs32Encoder
export type RedeemerHash = BS32
export const redeemerHashEncoder = bs32Encoder

export type CurrencySymbol = string & { readonly CurrencySymbol: unique symbol }
const currencySymbol = (input: string): CurrencySymbol => {
  const isCurrencySymbol = (s: string): s is CurrencySymbol => s === '' || isBSOfLength(28, s)
  if (!isCurrencySymbol(input))
    throw new Error('Invalid currency symbol')
  return input
}
export const currencySymbolEncoder: Encoder<string, CurrencySymbol> =
  { name: 'string', validator: currencySymbol, proxy: null }

export type TokenName = string & { readonly TokenName: unique symbol }
const tokenName = (input: string): TokenName => {
  const isTokenName = (s: string): s is TokenName => /^([0-9A-Fa-f]{2}){0,32}$/.test(s)
  if (!isTokenName(input))
    throw new Error('Invalid token name')
  return input
}
export const tokenNameEncoder: Encoder<string, TokenName> =
  { name: 'string', validator: tokenName, proxy: null }

const assetClassSchema = {
  name: 'AssetClass' as const,
  constructor: 0n,
  fields: [
    [ 'currencySymbol', currencySymbolEncoder ],
    [ 'tokenName', tokenNameEncoder ],
  ] as const,
}
addTypeSchema(assetClassSchema)
export type AssetClass = SchemaToType<typeof assetClassSchema>
export const assetClassEncoder = schemaEncoder<AssetClass>('AssetClass')

export type Value = Map<CurrencySymbol, Map<TokenName, bigint>>
export const valueEncoder =
  validMapEncoder<string, CurrencySymbol, Map<string, bigint>, Map<TokenName, bigint>>
    (currencySymbolEncoder, validMapEncoder<string, TokenName, bigint, bigint>(tokenNameEncoder, bigintEncoder))

export const positiveValueEncoder =
  validMapEncoder<string, CurrencySymbol, Map<string, bigint>, Map<TokenName, Positive>>
    (currencySymbolEncoder, validMapEncoder<string, TokenName, bigint, Positive>(tokenNameEncoder, positiveEncoder))

export const naturalValueEncoder =
  validMapEncoder<string, CurrencySymbol, Map<string, bigint>, Map<TokenName, Natural>>
    (currencySymbolEncoder, validMapEncoder<string, TokenName, bigint, Natural>(tokenNameEncoder, naturalEncoder))

export const nonZeroValueEncoder =
  validMapEncoder<string, CurrencySymbol, Map<string, bigint>, Map<TokenName, NonZero>>
    (currencySymbolEncoder, validMapEncoder<string, TokenName, bigint, NonZero>(tokenNameEncoder, nonZeroEncoder))

// TODO: maybe use this to validate Values?
const adaNaturalTokenPositiveValidator = (input: Map<string, Map<string, bigint>>): Map<CurrencySymbol, Map<TokenName, bigint>> => {
  const csMap = new Map()
  input.forEach((assets, inputCs) => {
    const tnMap = new Map()
    const cs = currencySymbol(inputCs)
    assets.forEach((quantityInput, tnInput) => {
      const tn = tokenName(tnInput)
      const quantity = natural(quantityInput)
      tnMap.set(tn, quantity)
    })
    csMap.set(cs, tnMap)
  })
  return csMap
}

// TODO: maybe use this to encode Values?
export const adaNaturalTokenPositiveValueEncoder =
  validMapEncoder2<string, CurrencySymbol, Map<string, bigint>, Map<TokenName, bigint>>(adaNaturalTokenPositiveValidator)

export const assetsToValue = (assets: Assets): Value => {
  const value: Value = new Map()
  Object.entries(assets).forEach(([k, v]) => {
    const cs = currencySymbol(k.slice(0,56))
    const tn = tokenName(k.slice(56,))
    if (!value.has(cs))
      value.set(cs, new Map())
    value.get(cs)!.set(tn, v)
  })
  return value
}

export const valueToAssets = (value: Value): Assets => {
  const assets: Assets = {};
  value.forEach((t, cs) => {
    t.forEach((v, tn) => {
      assets[cs + tn] = v;
    })
  })
  return assets;
}

const pubKeyCredentialSchema = {
  name: 'PubKeyCredential' as const,
  constructor: 0n,
  fields: [ [ 'hash', bs28Encoder ] ] as const
}
addTypeSchema(pubKeyCredentialSchema)
export type PubKeyCredential = SchemaToType<typeof pubKeyCredentialSchema>

const scriptCredentialSchema = {
  name: 'ScriptCredential' as const,
  constructor: 1n,
  fields: [ [ 'hash', bs28Encoder ] ] as const
}
addTypeSchema(scriptCredentialSchema)
export type ScriptCredential = SchemaToType<typeof scriptCredentialSchema>

export type Credential = PubKeyCredential | ScriptCredential
export const credentialEncoder =
  unionEncoder<Credential, ['PubKeyCredential', 'ScriptCredential']>(['PubKeyCredential', 'ScriptCredential'])

const stakingHashSchema = {
  name: 'StakingHash' as const,
  constructor: 0n,
  fields: [ [ 'credential', credentialEncoder ] ] as const
}
addTypeSchema(stakingHashSchema)
export type StakingHash = SchemaToType<typeof stakingHashSchema>

const stakingPtrSchema = {
  name: 'StakingPtr' as const,
  constructor: 1n,
  fields: [
    [ 'slotIndex', bigintEncoder ],
    [ 'txIndex', bigintEncoder ],
    [ 'dcertIndex', bigintEncoder ]
  ] as const
}
addTypeSchema(stakingPtrSchema)
export type StakingPtr = SchemaToType<typeof stakingPtrSchema>

export type StakingCredential = StakingHash | StakingPtr
export const stakingCredentialEncoder =
  unionEncoder<StakingCredential, ['StakingHash', 'StakingPtr']>(['StakingHash', 'StakingPtr'])

const nothingSchema = {
  name: 'Nothing' as const,
  constructor: 1n,
  fields: [] as const
}
addTypeSchema(nothingSchema)
export type Nothing = SchemaToType<typeof nothingSchema>
export const Nothing: Nothing = { kind: 'Nothing' }

export const isNothing = (v: any): v is Nothing => v.kind === 'Nothing'

// TODO: figure out polymorphic types
const justPubKeyHashSchema = {
  name: 'JustPubKeyHash' as const,
  constructor: 0n,
  fields: [ [ 'hash', pubKeyHashEncoder ] ] as const
}
addTypeSchema(justPubKeyHashSchema)
export type JustPubKeyHash = SchemaToType<typeof justPubKeyHashSchema>

export type MaybePubKeyHash = JustPubKeyHash | Nothing
export const maybePubKeyHashEncoder =
  unionEncoder<MaybePubKeyHash, ['JustPubKeyHash', 'Nothing']>(['JustPubKeyHash', 'Nothing'])

const justScriptHashSchema = {
  name: 'JustScriptHash' as const,
  constructor: 0n,
  fields: [ [ 'hash', scriptHashEncoder ] ] as const
}
addTypeSchema(justScriptHashSchema)
export type JustScriptHash = SchemaToType<typeof justScriptHashSchema>

export type MaybeScriptHash = JustScriptHash | Nothing
export const maybeScriptHashEncoder =
  unionEncoder<MaybeScriptHash, ['JustScriptHash', 'Nothing']>(['JustScriptHash', 'Nothing'])

const txIdSchema = {
  name: 'TxId' as const,
  constructor: 0n,
  fields: [
    [ 'id', bs32Encoder ],
  ] as const,
}
addTypeSchema(txIdSchema);
export type TxId = SchemaToType<typeof txIdSchema>
export const txIdEncoder = schemaEncoder<TxId>('TxId')

const txOutRefSchema = {
  name: 'TxOutRef' as const,
  constructor: 0n,
  fields: [
    [ 'txId', txIdEncoder ],
    [ 'txIdx', naturalEncoder ],
  ] as const,
}
addTypeSchema(txOutRefSchema);
export type TxOutRef = SchemaToType<typeof txOutRefSchema>
export const txOutRefEncoder = schemaEncoder<TxOutRef>('TxOutRef')

const justStakingCredentialSchema = {
  name: 'JustStakingCredential' as const,
  constructor: 0n,
  fields: [ [ 'stakingCredential', stakingCredentialEncoder ] ] as const
}
addTypeSchema(justStakingCredentialSchema)
type JustStakingCredential = SchemaToType<typeof justStakingCredentialSchema>

export type MaybeStakingCredential = JustStakingCredential | Nothing
export const maybeStakingCredentialEncoder =
  unionEncoder<MaybeStakingCredential, ['JustStakingCredential', 'Nothing']>(['JustStakingCredential', 'Nothing'])

const addressSchema = {
  name: 'Address' as const,
  constructor: 0n,
  fields: [
    [ 'paymentCredential', credentialEncoder ],
    [ 'stakingCredential', maybeStakingCredentialEncoder ]
  ] as const
}
addTypeSchema(addressSchema)
export type Address = SchemaToType<typeof addressSchema>
export const addressEncoder = schemaEncoder<Address>('Address')

export const posixTimeEncoder = naturalEncoder
export const diffMilliSecondsEncoder = naturalEncoder

const negInfSchema = {
  name: 'NegInf' as const,
  constructor: 0n,
  fields: [] as const
}
addTypeSchema(negInfSchema)
export type NegInf = SchemaToType<typeof negInfSchema>
export const negInfEncoder = schemaEncoder<NegInf>('NegInf')

const finitePOSIXTimeSchema = {
  name: 'FinitePOSIXTime' as const,
  constructor: 1n,
  fields: [ [ 'time', posixTimeEncoder ] ] as const
}
addTypeSchema(finitePOSIXTimeSchema)
export type FinitePOSIXTime = SchemaToType<typeof finitePOSIXTimeSchema>
export const finitePOSIXTimeEncoder =
  schemaEncoder<FinitePOSIXTime>('FinitePOSIXTime')

const posInfSchema = {
  name: 'PosInf' as const,
  constructor: 2n,
  fields: [] as const
}
addTypeSchema(posInfSchema)
export type PosInf = SchemaToType<typeof posInfSchema>
export const posInfEncoder = schemaEncoder<PosInf>('PosInf')

export type ExtendedPOSIXTime = NegInf | FinitePOSIXTime | PosInf
export const extendedPOSIXTimeEncoder =
  unionEncoder<ExtendedPOSIXTime, ['NegInf', 'FinitePOSIXTime', 'PosInf']>(['NegInf', 'FinitePOSIXTime', 'PosInf'])

const upperBoundPOSIXTimeSchema = {
  name: 'UpperBoundPOSIXTime' as const,
  constructor: 0n,
  fields: [
    [ 'bound', extendedPOSIXTimeEncoder ],
    [ 'closed', booleanEncoder ]
  ] as const
}
addTypeSchema(upperBoundPOSIXTimeSchema)
export type UpperBoundPOSIXTime = SchemaToType<typeof upperBoundPOSIXTimeSchema>
export const upperBoundPOSIXTimeEncoder =
  schemaEncoder<UpperBoundPOSIXTime>('UpperBoundPOSIXTime')

const lowerBoundPOSIXTimeSchema = {
  name: 'LowerBoundPOSIXTime' as const,
  constructor: 0n,
  fields: [
    [ 'bound', extendedPOSIXTimeEncoder ],
    [ 'closed', booleanEncoder ]
  ] as const
}
addTypeSchema(lowerBoundPOSIXTimeSchema)
export type LowerBoundPOSIXTime = SchemaToType<typeof lowerBoundPOSIXTimeSchema>
export const lowerBoundPOSIXTimeEncoder =
  schemaEncoder<LowerBoundPOSIXTime>('LowerBoundPOSIXTime')

const posixTimeRangeSchema = {
  name: 'POSIXTimeRange' as const,
  constructor: 0n,
  fields: [
    [ 'lowerBound', lowerBoundPOSIXTimeEncoder ],
    [ 'upperBound', upperBoundPOSIXTimeEncoder ]
  ] as const
}
addTypeSchema(posixTimeRangeSchema)
export type POSIXTimeRange = SchemaToType<typeof posixTimeRangeSchema>
export const posixTimeRangeEncoder = schemaEncoder<POSIXTimeRange>('POSIXTimeRange')

const dcertDelegRegKeySchema = {
  name: 'DCertDelegRegKey' as const,
  constructor: 0n,
  fields: [ [ 'credential', stakingCredentialEncoder ] ] as const
}
addTypeSchema(dcertDelegRegKeySchema)
export type DCertDelegRegKey = SchemaToType<typeof dcertDelegRegKeySchema>

const dcertDelegDeRegKeySchema = {
  name: 'DCertDelegDeRegKey' as const,
  constructor: 1n,
  fields: [ [ 'credential', stakingCredentialEncoder ] ] as const
}
addTypeSchema(dcertDelegDeRegKeySchema)
export type DCertDelegDeRegKey = SchemaToType<typeof dcertDelegDeRegKeySchema>

const dcertDelegDelegateSchema = {
  name: 'DCertDelegDelegate' as const,
  constructor: 2n,
  fields: [
    [ 'credential', stakingCredentialEncoder ],
    [ 'poolId', pubKeyHashEncoder ]
  ] as const
}
addTypeSchema(dcertDelegDelegateSchema)
export type DCertDelegDelegate = SchemaToType<typeof dcertDelegDelegateSchema>

const dcertPoolRegisterSchema = {
  name: 'DCertPoolRegister' as const,
  constructor: 3n,
  fields: [
    [ 'poolId', pubKeyHashEncoder ],
    [ 'poolVrf', pubKeyHashEncoder ]
  ] as const
}
addTypeSchema(dcertPoolRegisterSchema)
export type DCertPoolRegister = SchemaToType<typeof dcertPoolRegisterSchema>

const dcertPoolRetireSchema = {
  name: 'DCertPoolRetire' as const,
  constructor: 4n,
  fields: [
    [ 'poolId', pubKeyHashEncoder ],
    [ 'epoch', naturalEncoder ]
  ] as const
}
addTypeSchema(dcertPoolRetireSchema)
export type DCertPoolRetire = SchemaToType<typeof dcertPoolRetireSchema>

const dcertGenesisSchema = {
  name: 'DCertGenesis' as const,
  constructor: 5n,
  fields: [] as const
}
addTypeSchema(dcertGenesisSchema)
export type DCertGenesis = SchemaToType<typeof dcertGenesisSchema>

const dcertMirSchema = {
  name: 'DCertMir' as const,
  constructor: 6n,
  fields: [] as const
}
addTypeSchema(dcertMirSchema)
export type DCertMir = SchemaToType<typeof dcertMirSchema>

export type DCert
  = DCertDelegRegKey
  | DCertDelegDeRegKey
  | DCertDelegDelegate
  | DCertPoolRegister
  | DCertPoolRetire
  | DCertGenesis
  | DCertMir
const dcertConstructors = [
  'DCertDelegRegKey',
  'DCertDelegDeRegKey',
  'DCertDelegDelegate',
  'DCertPoolRegister',
  'DCertPoolRetire',
  'DCertGenesis',
  'DCertMir',
]
export const dcertEncoder = unionEncoder<DCert, typeof dcertConstructors>(dcertConstructors)

const txOutSchema = {
  name: 'TxOut' as const,
  constructor: 0n,
  fields: [
    [ 'address', addressEncoder ],
    [ 'value', positiveValueEncoder ],
    [ 'datumHash', datumHashEncoder ],
  ] as const
}
addTypeSchema(txOutSchema)
export type TxOut = SchemaToType<typeof txOutSchema>
export const txOutEncoder = schemaEncoder<TxOut>('TxOut')

const txInInfoSchema = {
  name: 'TxInInfo' as const,
  constructor: 0n,
  fields: [ 
    [ 'txOutRef', txOutRefEncoder ],
    [ 'txOut', txOutEncoder ]
  ] as const
}
addTypeSchema(txInInfoSchema)
export type TxInInfo = SchemaToType<typeof txInInfoSchema>
export const txInInfoEncoder = schemaEncoder<TxInInfo>('TxInInfo')

const withdrawalSchema = {
  name: 'Withdrawal' as const,
  constructor: 0n,
  fields: [
    [ 'credential', credentialEncoder ],
    [ 'amount', naturalEncoder ]
  ] as const
}
addTypeSchema(withdrawalSchema)
export type Withdrawal = SchemaToType<typeof withdrawalSchema>
export const withdrawalEncoder = schemaEncoder<Withdrawal>('Withdrawal')

const hashedDatumSchema = {
  name: 'HashedDatum' as const,
  constructor: 0n,
  fields: [
    [ 'hash', datumHashEncoder ],
    [ 'datum', rawDataEncoder ]
  ] as const
}
addTypeSchema(hashedDatumSchema)
export type HashedDatum = SchemaToType<typeof hashedDatumSchema>
export const hashedDatumEncoder = schemaEncoder<HashedDatum>('HashedDatum')

const txInfoSchema = {
  name: 'TxInfo' as const,
  constructor: 0n,
  fields: [
    [ 'inputs', listEncoder<TxInInfo>(txInInfoEncoder) ],
    [ 'outputs', listEncoder<TxOut>(txOutEncoder) ],
    [ 'fee', positiveValueEncoder ],
    [ 'mint', valueEncoder ],
    [ 'dcert', listEncoder<DCert>(dcertEncoder) ],
    [ 'wdrl', listEncoder<Withdrawal>(withdrawalEncoder) ],
    [ 'validRange', posixTimeRangeEncoder ],
    [ 'signatories', validListEncoder<string, PubKeyHash>(pubKeyHashEncoder) ],
    [ 'data', listEncoder<HashedDatum>(hashedDatumEncoder) ],
    [ 'id', txIdEncoder ]
  ] as const
}
addTypeSchema(txInfoSchema)
export type TxInfo = SchemaToType<typeof txInfoSchema>
export const txInfoEncoder = schemaEncoder<TxInfo>('TxInfo')

const mintingSchema = {
  name: 'Minting' as const,
  constructor: 0n,
  fields: [ [ 'currencySymbol', currencySymbolEncoder ] ] as const
}
addTypeSchema(mintingSchema)
export type Minting = SchemaToType<typeof mintingSchema>

const spendingSchema = {
  name: 'Spending' as const,
  constructor: 1n,
  fields: [ [ 'ref', txOutRefEncoder ] ] as const
}
addTypeSchema(spendingSchema)
export type Spending = SchemaToType<typeof spendingSchema>

const rewardingSchema = {
  name: 'Rewarding' as const,
  constructor: 0n,
  fields: [ [ 'credential', stakingCredentialEncoder ] ] as const
}
addTypeSchema(rewardingSchema)
export type Rewarding = SchemaToType<typeof rewardingSchema>

const certifyingSchema = {
  name: 'Certifying' as const,
  constructor: 0n,
  fields: [ [ 'dcert', dcertEncoder ] ] as const
}
addTypeSchema(mintingSchema)
export type Certifying = SchemaToType<typeof certifyingSchema>

export type ScriptPurpose = Minting | Spending | Rewarding | Certifying
const scriptPurposeConstructors = ['Minting', 'Spending', 'Rewarding', 'Certifying']
export const scriptPurposeEncoder =
  unionEncoder<ScriptPurpose, typeof scriptPurposeConstructors>(scriptPurposeConstructors)

const scriptContextSchema = {
  name: 'ScriptContext' as const,
  constructor: 0n,
  fields: [
    [ 'info', txInfoEncoder ],
    [ 'purpose', scriptPurposeEncoder ]
  ] as const
}
addTypeSchema(scriptContextSchema)
export type ScriptContext = SchemaToType<typeof scriptContextSchema>
export const scriptContextEncoder = schemaEncoder<ScriptContext>('ScriptContext')
