import { 
  SchemaData,
  SchemaToType,
  addTypeSchema,
  rawDataEncoder,
  listEncoder,
  validListEncoder,
  mapEncoder,
  validMapEncoder,
  schemaEncoder,
  unionEncoder,
} from './schema.ts'
import {
  DatumHash,
  DCert,
  Natural,
  PubKeyHash,
  ScriptPurpose,
  StakingCredential,
  TxInInfo,
  addressEncoder,
  datumHashEncoder,
  dcertEncoder,
  maybeScriptHashEncoder,
  naturalEncoder,
  positiveValueEncoder,
  posixTimeRangeEncoder,
  pubKeyHashEncoder,
  scriptPurposeEncoder,
  stakingCredentialEncoder,
  txIdEncoder,
  txInInfoEncoder,
  valueEncoder,
} from './plutus-v1-encoders.ts'

const noOutputDatumSchema = {
  name: 'NoOutputDatum' as const,
  constructor: 0n,
  fields: [] as const
}
addTypeSchema(noOutputDatumSchema)
export type NoOutputDatum = SchemaToType<typeof noOutputDatumSchema>

const outputDatumHashSchema = {
  name: 'OutputDatumHash' as const,
  constructor: 1n,
  fields: [ [ 'hash', datumHashEncoder ] ] as const
}
addTypeSchema(outputDatumHashSchema)
export type OutputDatumHash = SchemaToType<typeof outputDatumHashSchema>

const outputDatumValueSchema = {
  name: 'OutputDatumValue' as const,
  constructor: 2n,
  fields: [ [ 'datum', rawDataEncoder ] ] as const
}
addTypeSchema(outputDatumValueSchema)
export type OutputDatumValue = SchemaToType<typeof outputDatumValueSchema>

export type OutputDatum = NoOutputDatum | OutputDatumHash | OutputDatumValue
export const outputDatumEncoder =
  unionEncoder<OutputDatum, ['NoOutputDatum', 'OutputDatumHash', 'OutputDatumValue']>(['NoOutputDatum', 'OutputDatumHash', 'OutputDatumValue'])

const txOutSchema = {
  name: 'TxOut' as const,
  constructor: 0n,
  fields: [
    [ 'address', addressEncoder ],
    [ 'value', positiveValueEncoder ],
    [ 'datum', outputDatumEncoder ],
    [ 'referenceScript', maybeScriptHashEncoder ]
  ] as const
}
addTypeSchema(txOutSchema)
export type TxOut = SchemaToType<typeof txOutSchema>
export const txOutEncoder = schemaEncoder<TxOut>('TxOut')

const txInfoSchema = {
  name: 'TxInfo' as const,
  constructor: 0n,
  fields: [
    [ 'inputs', listEncoder<TxInInfo>(txInInfoEncoder) ],
    [ 'referenceInputs', listEncoder<TxInInfo>(txInInfoEncoder) ],
    [ 'outputs', listEncoder<TxOut>(txOutEncoder) ],
    [ 'fee', positiveValueEncoder ],
    [ 'mint', valueEncoder ],
    [ 'dcert', listEncoder<DCert>(dcertEncoder) ],
    [
      'wdrl',
      validMapEncoder<StakingCredential, StakingCredential, bigint, Natural>(stakingCredentialEncoder, naturalEncoder)
    ],
    [ 'validRange', posixTimeRangeEncoder ],
    [ 'signatories', validListEncoder<string, PubKeyHash>(pubKeyHashEncoder) ],
    [ 'redeemers', mapEncoder<ScriptPurpose, SchemaData>(scriptPurposeEncoder, rawDataEncoder) ],
    [ 'data', validMapEncoder<string, DatumHash, SchemaData, SchemaData>(datumHashEncoder, rawDataEncoder) ],
    [ 'id', txIdEncoder ]
  ] as const
}
addTypeSchema(txInfoSchema)
export type TxInfo = SchemaToType<typeof txInfoSchema>
export const txInfoEncoder = schemaEncoder<TxInfo>('TxInfo')
