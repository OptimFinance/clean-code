import { 
  SchemaToType,
  addTypeSchema,
  bigintEncoder,
  listEncoder,
  rawDataEncoder,
  toPlutusData,
} from './schema.ts'
import {
  currencySymbolEncoder,
  tokenNameEncoder,
  pubKeyHashEncoder,
  positiveEncoder,
  stakingCredentialEncoder,
  maybePubKeyHashEncoder,
  txOutRefEncoder,
  naturalValueEncoder,
  assetClassEncoder,
  scriptHashEncoder,
  addressEncoder,
  maybeBigIntEncoder,
} from './plutus-v1-encoders.ts'
import {} from './plutus-v2-encoders.ts'
import { Constr } from "lucid";

export const liquidityBondPostDatumSchema = {
  name: 'LiquidityBondPostDatum' as const,
  constructor: 0n,
  fields: [
    [ 'epoRewards', naturalValueEncoder ],
    [ 'duration', positiveEncoder ],
    [ 'bondSymbol', currencySymbolEncoder ],
    [ 'tokenName', tokenNameEncoder ],
    [ 'bondAmount', positiveEncoder ],
    [ 'buffer', bigintEncoder ],
    [ 'otmFee', positiveEncoder ],
    [ 'stakeKey', stakingCredentialEncoder ],
    [ 'permissioned', maybePubKeyHashEncoder ],
  ] as const,
}
addTypeSchema(liquidityBondPostDatumSchema);
export type LiquidityBondPostDatum = SchemaToType<typeof liquidityBondPostDatumSchema>

export const liquidityBondOpenDatumSchema = {
  name: 'LiquidityBondOpenDatum' as const,
  constructor: 0n,
  fields: [
    [ 'epoRewards', naturalValueEncoder ],
    [ 'duration', positiveEncoder ],
    [ 'bondSymbol', currencySymbolEncoder ],
    [ 'tokenName', tokenNameEncoder ],
    [ 'bondAmount', positiveEncoder ],
    [ 'buffer', bigintEncoder ],
    [ 'otmFee', positiveEncoder ],
    [ 'ogLender', pubKeyHashEncoder ],
    [ 'start', positiveEncoder ],
  ] as const,
}
addTypeSchema(liquidityBondOpenDatumSchema);
export type LiquidityBondOpenDatum = SchemaToType<typeof liquidityBondOpenDatumSchema>

const mintNftSchema = {
  name: 'MintNft' as const,
  constructor: 0n,
  fields: [
    [ 'txOutRef', txOutRefEncoder ],
  ] as const,
}
addTypeSchema(mintNftSchema);
export type MintNft = SchemaToType<typeof mintNftSchema>

const burnNftSchema = {
  name: 'BurnNft' as const,
  constructor: 1n,
  fields: [] as const,
}
addTypeSchema(burnNftSchema);
export type BurnNft = SchemaToType<typeof burnNftSchema>

export type NftMintingPolicyRedeemer = MintNft | BurnNft

const writeSchema = {
  name: 'Write' as const,
  constructor: 0n,
  fields: [] as const,
}
addTypeSchema(writeSchema);
type Write = SchemaToType<typeof writeSchema>

const cancelSchema = {
  name: 'Cancel' as const,
  constructor: 1n,
  fields: [] as const,
}
addTypeSchema(cancelSchema);
type Cancel = SchemaToType<typeof cancelSchema>

export type BondWriterValidatorRedeemer = Write | Cancel

const closeSchema = {
  name: 'Close' as const,
  constructor: 0n,
  fields: [] as const,
}
addTypeSchema(closeSchema);
type Close = SchemaToType<typeof closeSchema>

const keychangeSchema = {
  name: 'Keychange' as const,
  constructor: 1n,
  fields: [] as const,
}
addTypeSchema(keychangeSchema);
type Keychange = SchemaToType<typeof keychangeSchema>

const marginAddSchema = {
  name: 'MarginAdd' as const,
  constructor: 2n,
  fields: [
    [ 'epochs', positiveEncoder ]
  ] as const,
}
addTypeSchema(marginAddSchema);
type MarginAdd = SchemaToType<typeof marginAddSchema>

export type OpenValidatorRedeemer = Close | Keychange | MarginAdd

export const collateralAmoDatumSchema = {
  name: 'CollateralAmoDatum' as const,
  constructor: 0n,
  fields: [
    [ 'adaProfitUncommitted', bigintEncoder ],
    [ 'stakingAmo', assetClassEncoder ],
    [ 'childStrategies', listEncoder(assetClassEncoder) ]
  ] as const
}
addTypeSchema(collateralAmoDatumSchema)
export type CollateralAmoDatum = SchemaToType<typeof collateralAmoDatumSchema>

export const stakingAmoDatumSchema = {
  name: 'StakingAmoDatum' as const,
  constructor: 0n,
  fields: [
    [ 'sotoken', scriptHashEncoder ],
    [ 'sotokenAmount', bigintEncoder ],
    [ 'sotokenBacking', bigintEncoder ],
    [ 'sotokenLimit', bigintEncoder ],
    [ 'odaoFee', bigintEncoder ],
    [ 'odaoSotoken', bigintEncoder ],
    [ 'feeClaimer', assetClassEncoder ],
    [ 'feeClaimRule', scriptHashEncoder ]
  ] as const
}
addTypeSchema(stakingAmoDatumSchema)
export type StakingAmoDatum = SchemaToType<typeof stakingAmoDatumSchema>

export const updateStakingAmoSchema = {
  name: 'UpdateStakingAmo' as const,
  constructor: 0n,
  fields: [] as const
}
addTypeSchema(updateStakingAmoSchema)
export type UpdateStakingAmo = SchemaToType<typeof updateStakingAmoSchema>

export const spawnStrategySchema = {
  name: 'SpawnStrategy' as const,
  constructor: 1n,
  fields: [
    [ 'strategy', scriptHashEncoder ],
    [ 'txOutRef', txOutRefEncoder ]
  ] as const
}
addTypeSchema(spawnStrategySchema)
export type SpawnStrategy = SchemaToType<typeof spawnStrategySchema>

export const despawnStrategySchema = {
  name: 'DespawnStrategy' as const,
  constructor: 2n,
  fields: [
    [ 'id', assetClassEncoder ]
  ] as const
}
addTypeSchema(despawnStrategySchema)
export type DespawnStrategy = SchemaToType<typeof despawnStrategySchema>

export const syncStrategyCollateralSchema = {
  name: 'SyncStrategyCollateral' as const,
  constructor: 3n,
  fields: [
    [ 'id', assetClassEncoder ]
  ] as const
}
addTypeSchema(syncStrategyCollateralSchema)
export type SyncStrategyCollateral = SchemaToType<typeof syncStrategyCollateralSchema>

export const mergeStakingRateSchema = {
  name: 'MergeStakingRate' as const,
  constructor: 4n,
  fields: [] as const
}
addTypeSchema(mergeStakingRateSchema)
export type MergeStakingRate = SchemaToType<typeof mergeStakingRateSchema>

export const mergeNewDepositsSchema = {
  name: 'MergeNewDeposits' as const,
  constructor: 5n,
  fields: [] as const
}
addTypeSchema(mergeNewDepositsSchema)
export type MergeNewDeposits = SchemaToType<typeof mergeNewDepositsSchema>

export type CollateralAmoRedeemer
  = UpdateStakingAmo
  | SpawnStrategy
  | DespawnStrategy
  | SyncStrategyCollateral
  | MergeStakingRate
  | MergeNewDeposits

export const closeStrategySchema = {
  name: 'CloseStrategy' as const,
  constructor: 0n,
  fields: [] as const
}
addTypeSchema(closeStrategySchema)
export type CloseStrategy = SchemaToType<typeof closeStrategySchema>

export const syncStrategySchema = {
  name: 'SyncStrategy' as const,
  constructor: 1n,
  fields: [] as const
}
addTypeSchema(syncStrategySchema)
export type SyncStrategy = SchemaToType<typeof syncStrategySchema>

export type StrategyRedeemer = CloseStrategy | SyncStrategy

export const donateSchema = {
  name: 'Donate' as const,
  constructor: 2n,
  fields: [] as const
}
addTypeSchema(donateSchema)
export type Donate = SchemaToType<typeof donateSchema>

export type DonationStrategyRedeemer = StrategyRedeemer | Donate

export const strategyDatumSchema = {
  name: 'StrategyDatum' as const,
  constructor: 0n,
  fields: [
    [ 'adaProfit', bigintEncoder ],
    [ 'strategyData', rawDataEncoder ]
  ] as const
}
addTypeSchema(strategyDatumSchema)
export type StrategyDatum = SchemaToType<typeof strategyDatumSchema>

export const donationDatumSchema = {
  name: 'DonationDatum' as const,
  constructor: 0n,
  fields: [] as const
}
addTypeSchema(donationDatumSchema)
export type DonationDatum = SchemaToType<typeof donationDatumSchema>

export const batchStakeDatumSchema  = {
  name: 'BatchStakeDatum' as const,
  constructor: 0n,
  fields: [
    [ 'owner', pubKeyHashEncoder ],
    [ 'returnAddress', addressEncoder ]
  ] as const
}
addTypeSchema(batchStakeDatumSchema)
export type BatchStakeDatum = SchemaToType<typeof batchStakeDatumSchema>

export const cancelStakeSchema = {
  name: 'CancelStake' as const,
  constructor: 0n,
  fields: []
}
addTypeSchema(cancelStakeSchema)
export type CancelStake = SchemaToType<typeof cancelStakeSchema>

export const digestStakeSchema = {
  name: 'DigestStake' as const,
  constructor: 1n,
  fields: [
    [ "returnIndex", bigintEncoder ],
    [ "continuingOrderIndex", maybeBigIntEncoder ]
  ] as const
}
addTypeSchema(digestStakeSchema)
export type DigestStake = SchemaToType<typeof digestStakeSchema>

export type BatchStakeRedeemer = CancelStake | DigestStake

export const toWrappedData = (data: any) => new Constr(1, [toPlutusData(data)])

export const _x = (() => 1)()
