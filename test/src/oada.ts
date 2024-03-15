import {
  Assets,
  C,
  Data,
  Lucid,
  ScriptHash,
} from 'lucid'
import * as L from 'lucid'
import * as hex from 'https://deno.land/std@0.216.0/encoding/hex.ts'
import UtilScripts from '../scripts/utils.json' assert { type: 'json' };
import OadaScripts from '../scripts/oada.json' assert { type: 'json' };

import {Tx, Validator, transformOutputDatumByNft} from './types.ts'
import {addSignature, handleError, mkScriptUtils, newWallet, withTrace, wrapRedeemer} from './utils.ts'

import {
  CollateralAmoDatum,
  CollateralAmoRedeemer,
  DonationDatum,
  MintNft,
  StakingAmoDatum,
  StrategyDatum,
  _x,
  collateralAmoDatumSchema,
  stakingAmoDatumSchema,
  strategyDatumSchema,
  toWrappedData
} from "./datums.ts";
import { fromPlutusData, toData, toPlutusData } from "./schema.ts";
import { AssetClass } from "./plutus-v1-encoders.ts";

// hack to force evaluate the datums module until I can figure out the right way
const _xx = _x
 
export type OtokenId = 'StakingAmo' | 'CollateralAmo'
export type OadaStrategy = 'DonationStrategy'
export const initOtoken = async ({
  lucid,
  baseAsset,
  soul,
  soulToken,
  controllerPrivateKey,
  initialCollateralAmoDatum,
  initialStakingAmoDatum,
  feeClaimer,
  feeClaimerToken,
}: {
  lucid: Lucid
  baseAsset: AssetClass,
  soul: { privateKey: C.PrivateKey, address: L.Address, pubKeyHash: L.KeyHash },
  soulToken: AssetClass
  controllerPrivateKey: C.PrivateKey
  initialCollateralAmoDatum: CollateralAmoDatum
  initialStakingAmoDatum: StakingAmoDatum
  feeClaimer: { privateKey: C.PrivateKey, address: L.Address, pubKeyHash: L.KeyHash },
  feeClaimerToken: AssetClass
}) => {
  const scriptUtils = mkScriptUtils(lucid)

  const {
    loadValidator,
    sequenceTransactions,
  } = scriptUtils;

  const baseAssetUnit = (baseAsset.currencySymbol + baseAsset.tokenName) || 'lovelace'
  const soulTokenData = toPlutusData(soulToken)
  const amoWhitelist = loadValidator(UtilScripts, 'whitelist', [soulTokenData, 0n])
  const controllerWhitelist = loadValidator(UtilScripts, 'whitelist', [soulTokenData, 1n])
  const strategyWhitelist = loadValidator(UtilScripts, 'whitelist', [soulTokenData, 2n])
  const collateralAmo = loadValidator(OadaScripts, 'collateral_amo', [soulTokenData, controllerWhitelist.hash, strategyWhitelist.hash])
  const otokenPolicy = loadValidator(OadaScripts, 'otoken_policy', [amoWhitelist.hash])

  const controllerPubKeyHash = controllerPrivateKey.to_public().hash().to_hex()

  const seedMaster = newWallet(lucid)

  const newTx = () => new Tx(lucid)

  const seedUtxoToMintRedeemer = (
    seedUtxo: L.UTxO
  ): MintNft => {
    return {
        kind: 'MintNft',
        txOutRef: {
          kind: 'TxOutRef',
          txId: { kind: 'TxId', id: seedUtxo.txHash },
          txIdx: BigInt(seedUtxo.outputIndex)
        }
      }
  }

  const utxoToTokenName = (
    seedUtxo: L.UTxO
  ) => {
    const mintRedeemer = seedUtxoToMintRedeemer(seedUtxo)
    return hex.encodeHex(C.hash_blake2b256(hex.decodeHex(Data.to(toPlutusData(mintRedeemer.txOutRef)))))
  }

  const newTokenName = async (
  ): Promise<{ newTokenName: string, seedUtxo: L.UTxO }> => {
    const assets = { lovelace: 1_000_000n }
    const address = seedMaster.address
    const txHash =
      await newTx()
        .payToAddress(address, assets)
        .complete()
        .then(tx => tx.sign().complete())
        .then(tx => tx.submit())
    await lucid.awaitTx(txHash)
    const [seedUtxo] = await lucid.utxosByOutRef([{ txHash, outputIndex: 0 }])
    return { newTokenName: utxoToTokenName(seedUtxo), seedUtxo }
  }

  const mintId = async (
    validator: Validator,
    datum: Data,
    seedUtxo?: L.UTxO
  ): Promise<Tx> => {
    if (!seedUtxo) {
      const result = await newTokenName()
      seedUtxo = result.seedUtxo
    }
    const tokenName = utxoToTokenName(seedUtxo)
    const mintRedeemer = seedUtxoToMintRedeemer(seedUtxo)
    const tx = newTx()
      .attachMintingPolicy(validator.validator)
      .collectFrom([seedUtxo])
      .mintAssets(
        { [validator.hash + tokenName]: 1n },
        Data.to(toPlutusData(mintRedeemer))
      )
      .payToAddressWithData(
        validator.mkAddress(),
        { inline: Data.to(datum) },
        { [validator.hash + tokenName]: 1n }
      )
      .signWithPrivateKey(seedMaster.privateKey)
    return tx
  }

  const referenceWhitelist = async(whitelist: Validator, hash?: string): Promise<Tx> => {
    const whitelistUtxos = await lucid.utxosAt(whitelist.mkAddress())
    return newTx()
      .readFrom(whitelistUtxos.filter(utxo => !hash || Data.from(utxo.datum!) === hash))
  }

  const includeAdminToken = async(): Promise<Tx> => {
    const soulTokenInput = await lucid.utxoByUnit(soulToken.currencySymbol + soulToken.tokenName)
    return newTx()
      .collectFrom([soulTokenInput])
      .payToAddress(soul.address, soulTokenInput.assets)
  }

  const includeFeeClaimerToken = async(): Promise<Tx> => {
    const feeClaimerInput = await lucid.utxoByUnit(feeClaimerToken.currencySymbol + feeClaimerToken.tokenName)
    return newTx()
      .collectFrom([feeClaimerInput])
      .payToAddress(feeClaimer.address, feeClaimerInput.assets)
  }

  const signByController = async(): Promise<Tx> => {
    return newTx()
      .compose(await referenceWhitelist(controllerWhitelist, controllerPubKeyHash))
      .addSignerKey(controllerPubKeyHash)
  }

  const mkMintOtoken = (
    depositAmo: Validator,
    otokenRule: Validator
  ) => async (amount: bigint): Promise<Tx> => {
    return newTx()
      .attachMintingPolicy(otokenPolicy.validator)
      .attachWithdrawalValidator(otokenRule.validator)
      .mintAssets({ [otokenPolicy.hash]: amount }, Data.void())
      .withdraw(otokenRule.mkRewardAddress(), 0n, Data.void())
      .compose(await referenceWhitelist(amoWhitelist, otokenRule.hash))
      .payToContract(
        depositAmo.mkAddress(),
        { inline: Data.void() },
        { [baseAssetUnit]: amount }
      )
  }

  const mkMergeDeposits = (
    depositAmo: Validator,
  ) => async (): Promise<Tx> => {
    const cmUtxo = await getCmUtxo()
    const depositUtxos = await lucid.utxosAt(depositAmo.mkAddress())
    return newTx()
      .attachSpendingValidator(depositAmo.validator)
      .collectFrom(depositUtxos, Data.to(toWrappedData(0n)))
      .withdraw(depositAmo.mkRewardAddress(), 0n, Data.void())
      .compose(await signByController())
      .attachSpendingValidator(collateralAmo.validator)
      .collectFrom([cmUtxo], Data.to(toWrappedData({ kind: 'MergeNewDeposits' })))
      .payToContract(
        collateralAmo.mkAddress(),
        { inline: cmUtxo.datum! },
        {
          ...cmUtxo.assets,
          [baseAssetUnit]: (cmUtxo.assets[baseAssetUnit] ?? 0n) + depositUtxos.reduce(
            (acc, utxo) => (utxo.assets[baseAssetUnit] ?? 0n) + acc, 0n
          )
        }
      )
  }

  const mkDonate = (
    donationStrategy: Validator
  ) => async (amount: bigint): Promise<Tx> => {
    const donationUtxo =
      await lucid.utxoByUnit(donationStrategy.hash + donationStrategyTokenName)
    const previousDatum: StrategyDatum =
      fromPlutusData(strategyDatumSchema, Data.from(donationUtxo.datum!))
    const donationStrategyDatum: StrategyDatum = {
      kind: 'StrategyDatum',
      adaProfit: previousDatum.adaProfit + amount,
      strategyData: toData({ kind: 'DonationDatum' } as DonationDatum)
    }
    return newTx()
      .collectFrom([donationUtxo], Data.to(toWrappedData({ kind: 'Donate' })))
      .attachSpendingValidator(donationStrategy.validator)
      .payToContract(
        donationStrategy.mkAddress(),
        {
          inline: Data.to(toPlutusData(donationStrategyDatum))
        },
        {
          ...donationUtxo.assets,
          [baseAssetUnit]: (donationUtxo.assets[baseAssetUnit] ?? 0n) + amount
        }
      )
  }

  const spawnStrategy = async (
    strategy: Validator,
    initialDatum: any,
    seedUtxo?: L.UTxO
  ): Promise<Tx> => {
    if (!seedUtxo) {
      const result = await newTokenName()
      seedUtxo = result.seedUtxo
    } 
    const strategyTokenName = utxoToTokenName(seedUtxo)
    const strategyDatum: StrategyDatum = {
      kind: 'StrategyDatum',
      adaProfit: 0n,
      strategyData: toData(initialDatum)
    }
    const mintTx =
      await mintId(
          donationStrategy, 
          toPlutusData(strategyDatum),
          seedUtxo
      )

    const cmUtxo = await getCmUtxo()
    const cmRedeemer: CollateralAmoRedeemer = {
      kind: 'SpawnStrategy',
      strategy: strategy.hash,
      txOutRef: {
        kind: 'TxOutRef',
        txId: {
          kind: 'TxId',
          id: seedUtxo.txHash
        },
        txIdx: BigInt(seedUtxo.outputIndex)
      }
    }
    const collateralAmoDatum: CollateralAmoDatum =
      fromPlutusData(collateralAmoDatumSchema, Data.from(cmUtxo.datum!))
    collateralAmoDatum.childStrategies.unshift({
      kind: 'AssetClass',
      currencySymbol: strategy.hash,
      tokenName: strategyTokenName
    })
    const tx = newTx()
      .compose(mintTx)
      .compose(await signByController())
      .compose(await referenceWhitelist(strategyWhitelist, donationStrategy.hash))
      .attachSpendingValidator(collateralAmo.validator)
      .collectFrom(
        [cmUtxo],
        Data.to(toWrappedData(cmRedeemer))
      )
      .payToContract(
        collateralAmo.mkAddress(),
        { inline: Data.to(toPlutusData(collateralAmoDatum)) },
        cmUtxo.assets
      )
    return tx
  }

  // FIXME: just for negative tests, after `strategyMap` has been populated
  const fakeSpawnStrategy = async (strategyId: OadaStrategy, initialDatum: any): Promise<Tx> => {
    const walletUtxos = await lucid.wallet.getUtxos()
    const seedUtxo = walletUtxos[0]
    const [strategy, _strategyTokenName] = strategyMap[strategyId]
    return spawnStrategy(strategy, initialDatum, seedUtxo)
  }

  const syncStrategy = async (
    strategyId: { policyId: string, tokenName: string },
    profit: bigint
  ): Promise<Tx> => {
    const cmUtxo = await getCmUtxo()
    const previousDatum: CollateralAmoDatum =
      fromPlutusData(collateralAmoDatumSchema, Data.from(cmUtxo.datum!))
    const redeemer: CollateralAmoRedeemer = {
      kind: 'SyncStrategyCollateral',
      id: {
        kind: 'AssetClass',
        currencySymbol: strategyId.policyId,
        tokenName: strategyId.tokenName
      }
    }
    return newTx()
      .attachSpendingValidator(collateralAmo.validator)
      .collectFrom([cmUtxo], Data.to(toWrappedData(redeemer)))
      .payToContract(
        collateralAmo.mkAddress(),
        {
          inline: Data.to(toPlutusData( {
            ...previousDatum,
            adaProfitUncommitted: previousDatum.adaProfitUncommitted + profit
          }))
        },
        {
          ...cmUtxo.assets,
          [baseAssetUnit]: cmUtxo.assets[baseAssetUnit] + profit
        }
      )
  }

  const despawnStrategy = async (strategyId: OadaStrategy): Promise<Tx> => {
    const [strategy, strategyTokenName] = strategyMap[strategyId]
    const cmUtxo = await getCmUtxo()
    const cmDatum: CollateralAmoDatum =
      fromPlutusData(collateralAmoDatumSchema, Data.from(cmUtxo.datum!))
    const strategyUtxo =
      await lucid.utxoByUnit(strategy.hash + strategyTokenName)
    const strategyDatum: StrategyDatum =
      fromPlutusData(strategyDatumSchema, Data.from(strategyUtxo.datum!))
    const remainingProfit = strategyDatum.adaProfit
    const redeemer: CollateralAmoRedeemer = 
      {
        kind: 'DespawnStrategy',
        id: {
          kind: 'AssetClass',
          currencySymbol: strategy.hash,
          tokenName: strategyTokenName
        }
      }

    const strategyIndex = cmDatum.childStrategies.findIndex(strategyId => 
      strategyId.currencySymbol === strategy.hash
        && strategyId.tokenName === strategyTokenName
    )
    cmDatum.childStrategies.splice(strategyIndex, 1)
    cmDatum.adaProfitUncommitted += remainingProfit
    return newTx()
      .compose(await signByController())
      .compose(await referenceWhitelist(strategyWhitelist, strategy.hash))
      .collectFrom([strategyUtxo], Data.to(toWrappedData({ kind: 'CloseStrategy' })))
      .attachSpendingValidator(strategy.validator)
      .attachMintingPolicy(strategy.validator)
      .mintAssets({
        [strategy.hash + strategyTokenName]: -1n
      }, Data.to(toPlutusData({ kind: 'BurnNft' })))
      .attachSpendingValidator(collateralAmo.validator)
      .collectFrom([cmUtxo], Data.to(toWrappedData(redeemer)))
      .payToContract(
        collateralAmo.mkAddress(),
        { inline: Data.to(toPlutusData(cmDatum)) },
        {
          ...cmUtxo.assets,
          lovelace: cmUtxo.assets.lovelace + strategyUtxo.assets.lovelace,
          [baseAssetUnit]: cmUtxo.assets[baseAssetUnit] + strategyUtxo.assets[baseAssetUnit]
        }
      )
  }


  const syncDonations = async (): Promise<Tx> => {
    const [strategy, strategyTokenName] = strategyMap['DonationStrategy']
    const donationUtxo =
      await lucid.utxoByUnit(strategy.hash + strategyTokenName)
    const previousDatum: StrategyDatum =
      fromPlutusData(strategyDatumSchema, Data.from(donationUtxo.datum!))
    const newDatum: StrategyDatum = {
      kind: 'StrategyDatum',
      adaProfit: 0n,
      strategyData: previousDatum.strategyData
    }
    const totalDonations = previousDatum.adaProfit
    const donationId = {
      policyId: donationStrategy.hash,
      tokenName: donationStrategyTokenName
    }
    return newTx()
      .compose(await signByController())
      .compose(await referenceWhitelist(strategyWhitelist, donationStrategy.hash))
      .collectFrom([donationUtxo], Data.to(toWrappedData({ kind: 'SyncStrategy' })))
      .attachSpendingValidator(donationStrategy.validator)
      .payToContract(
        donationStrategy.mkAddress(),
        { inline: Data.to(toPlutusData(newDatum)) },
        {
          ...donationUtxo.assets,
          [baseAssetUnit]: donationUtxo.assets[baseAssetUnit] - totalDonations
        }
      )
      .compose(await syncStrategy(donationId, totalDonations))
  }

  const mergeStakingRate = async (): Promise<Tx> => {
    const stakingAmoUtxo = await getStakingAmoUtxo()
    const previousStakingDatum: StakingAmoDatum =
      fromPlutusData(stakingAmoDatumSchema, Data.from(stakingAmoUtxo.datum!))
    const previousSotokenAmount = previousStakingDatum.sotokenAmount
    const previousSotokenBacking = previousStakingDatum.sotokenBacking
    const previousOdaoSotoken = previousStakingDatum.odaoSotoken
    const adaToSotoken = (n: bigint) => n * previousSotokenAmount / previousSotokenBacking
    const odaoFee = previousStakingDatum.odaoFee
    const cmUtxo = await getCmUtxo()
    const previousCmDatum: CollateralAmoDatum =
      fromPlutusData(collateralAmoDatumSchema, Data.from(cmUtxo.datum!))
    const newCmDatum: CollateralAmoDatum =
      {
        ...previousCmDatum,
        adaProfitUncommitted: 0n,
      }
    const mergeAmount = previousCmDatum.adaProfitUncommitted
    const sotokenDelta = adaToSotoken(mergeAmount * odaoFee / 10000n)
    const newStakingDatum: StakingAmoDatum =  {
      ...previousStakingDatum,
      sotokenAmount: previousSotokenAmount + sotokenDelta,
      sotokenBacking: previousSotokenBacking + mergeAmount,
      odaoSotoken: previousOdaoSotoken + sotokenDelta
    }
    const cmRedeemer: CollateralAmoRedeemer = { kind: 'MergeStakingRate' }
    return newTx()
      .compose(await signByController())
      .attachSpendingValidator(stakingAmo.validator)
      .collectFrom([stakingAmoUtxo], Data.to(wrapRedeemer(0n)))
      .payToContract(
        stakingAmo.mkAddress(),
        {
          inline:
            Data.to(toPlutusData(newStakingDatum))
        },
        stakingAmoUtxo.assets
      )
      .attachSpendingValidator(collateralAmo.validator)
      .collectFrom([cmUtxo], Data.to(toWrappedData(cmRedeemer)))
      .payToContract(
        collateralAmo.mkAddress(),
        { inline: Data.to(toPlutusData(newCmDatum)) },
        cmUtxo.assets
      )
  }

  const claimOdaoFee = async (): Promise<Tx> => {
    const stakingAmoUtxo = await getStakingAmoUtxo()
    const previousStakingDatum: StakingAmoDatum =
      fromPlutusData(stakingAmoDatumSchema, Data.from(stakingAmoUtxo.datum!))
    const sotokenAmount = previousStakingDatum.sotokenAmount
    const sotokenBacking = previousStakingDatum.sotokenBacking
    const odaoSotoken = previousStakingDatum.odaoSotoken
    const newStakingDatum: StakingAmoDatum = {
      ...previousStakingDatum,
      odaoSotoken: 0n
    }
    return newTx()
      .compose(await signByController())
      .compose(await includeFeeClaimerToken())
      .compose(await referenceWhitelist(amoWhitelist, feeClaimRule.hash))
      .attachWithdrawalValidator(feeClaimRule.validator)
      .withdraw(feeClaimRule.mkRewardAddress(), 0n, Data.void())
      .attachMintingPolicy(otokenPolicy.validator)
      .mintAssets(
        { [otokenPolicy.hash]: odaoSotoken * sotokenBacking / sotokenAmount },
        Data.void()
      )
      .attachSpendingValidator(stakingAmo.validator)
      .collectFrom([stakingAmoUtxo], Data.to(toWrappedData(0n)))
      .payToContract(
        stakingAmo.mkAddress(),
        { inline: Data.to(toPlutusData(newStakingDatum)) },
        stakingAmoUtxo.assets
      )
  }

  const setSotokenPolicy = async (sotokenPolicy: ScriptHash): Promise<Tx> => {
    const stakingAmoInput =
      await lucid.utxoByUnit(stakingAmo.hash + stakingAmoTokenName)
    const previousDatum: StakingAmoDatum =
      fromPlutusData(stakingAmoDatumSchema, Data.from(stakingAmoInput.datum!))
    const newDatum: StakingAmoDatum = {
      ...previousDatum,
      sotoken: {
        kind: 'AssetClass',
        currencySymbol: sotokenPolicy,
        tokenName: ''
      }
    }
    return newTx()
      .compose(await includeAdminToken())
      .attachSpendingValidator(stakingAmo.validator)
      .collectFrom([stakingAmoInput], Data.to(wrapRedeemer(0n)))
      .payToAddressWithData(
        stakingAmo.mkAddress(),
        { inline: Data.to(toPlutusData(newDatum)) },
        stakingAmoInput.assets
      )
  }

  const setStakingAmoTokenName = async (tokenName: string): Promise<Tx> => {
    const cmUtxo = await getCmUtxo()
    const cmDatum: CollateralAmoDatum =
      fromPlutusData(collateralAmoDatumSchema, Data.from(cmUtxo.datum!))
    const newCmDatum: CollateralAmoDatum = {
      ...cmDatum,
      stakingAmo: {
        kind: 'AssetClass',
        currencySymbol: stakingAmo.hash,
        tokenName
      }
    }
    return newTx()
      .compose(await signByController())
      .compose(await includeAdminToken())
      .attachSpendingValidator(collateralAmo.validator)
      .collectFrom([cmUtxo], Data.to(toWrappedData({ kind: 'UpdateStakingAmo' })))
      .payToContract(
        collateralAmo.mkAddress(),
        { inline: Data.to(toPlutusData(newCmDatum)) },
        cmUtxo.assets,
      )
  }

  const mintSotokenFromOtoken = async (amount: bigint): Promise<Tx> => {
    const stakingAmoUtxo = await getStakingAmoUtxo()
    const previousDatum = fromPlutusData(stakingAmoDatumSchema, Data.from(stakingAmoUtxo.datum!))
    const previousSotokenAmount = previousDatum.sotokenAmount
    const previousSotokenBacking = previousDatum.sotokenBacking
    const sotokenToOtoken = (n: bigint) =>
      previousSotokenBacking == 0n
        ? n
        : n * previousSotokenBacking / previousSotokenAmount
    const newDatum: StakingAmoDatum = {
      ...previousDatum,
      sotokenAmount: previousSotokenAmount + amount,
      sotokenBacking: previousSotokenBacking + sotokenToOtoken(amount)
    }
    return newTx()
      .compose(await signByController())
      .attachMintingPolicy(sotokenPolicy.validator)
      .attachMintingPolicy(otokenPolicy.validator)
      .attachWithdrawalValidator(sotokenRule.validator)
      .attachSpendingValidator(stakingAmo.validator)
      .compose(await referenceWhitelist(amoWhitelist, sotokenRule.hash))
      .withdraw(sotokenRule.mkRewardAddress(), 0n, Data.void())
      .mintAssets({
        [otokenPolicy.hash]: sotokenToOtoken(-amount) * (amount < 0n ? 999n : 1000n) / 1000n
      }, Data.void())
      .mintAssets(
        { [sotokenPolicy.hash]: amount },
        Data.to([previousSotokenBacking || 1n, previousSotokenAmount || 1n])
      )
      .collectFrom([stakingAmoUtxo], Data.to(toWrappedData(0n)))
      .payToContract(
        stakingAmo.mkAddress(),
        {
          inline: Data.to(toPlutusData(newDatum))
        },
        stakingAmoUtxo.assets
      )
  }

  const mintIdAsAdmin = (validator: Validator, datum: Data, seedUtxo?: L.UTxO) =>
    mintId(validator, datum, seedUtxo)
      .then(async tx => tx.compose(await includeAdminToken()))
      .then(tx => tx.signWithPrivateKey(soul.privateKey))

  const mkGetId = (idUnit: string) => () => lucid.utxoByUnit(idUnit)

  //////////////////////////////////////////////////////////////////////////////
  // ACTUAL TRANSACTIONS BELOW
  const { newTokenName: collateralAmoTokenName, seedUtxo: cmSeed } =
    await newTokenName()
  const { newTokenName: stakingAmoTokenName, seedUtxo: stakingAmoSeed } =
    await newTokenName()
  const { newTokenName: donationStrategyTokenName, seedUtxo: donationSeed } =
    await newTokenName()

  const collateralAmoId: AssetClass = {
    kind: 'AssetClass',
    currencySymbol: collateralAmo.hash,
    tokenName: collateralAmoTokenName
  }
  const depositAmo = loadValidator(
    OadaScripts,
    'deposit_amo',
    [toPlutusData(baseAsset), toPlutusData(collateralAmoId)]
  )
  const stakingAmo = loadValidator(
    OadaScripts,
    'staking_amo',
    [soulTokenData, toPlutusData(collateralAmoId)]
  )
  const donationStrategy = loadValidator(
    OadaScripts,
    'donation_strategy',
    [
      controllerWhitelist.hash,
      toPlutusData(baseAsset),
      toPlutusData(collateralAmoId)
    ]
  )
  const otokenRule = loadValidator(
    OadaScripts,
    'otoken_rule',
    [toPlutusData(baseAsset), otokenPolicy.hash, depositAmo.hash]
  )

  const mintOtoken = mkMintOtoken(depositAmo, otokenRule)
  const mergeDeposits = mkMergeDeposits(depositAmo)
  const donate = mkDonate(donationStrategy)

  const getCmUtxo = mkGetId(collateralAmo.hash + collateralAmoTokenName)
  const getStakingAmoUtxo = mkGetId(stakingAmo.hash + stakingAmoTokenName)

  const stakingAmoId: AssetClass = {
    kind: 'AssetClass',
    currencySymbol: stakingAmo.hash,
    tokenName: stakingAmoTokenName
  }
  const sotokenPolicy = loadValidator(
    OadaScripts,
    'sotoken_policy',
    [toPlutusData(stakingAmoId)]
  )
  const sotokenRule = loadValidator(
    OadaScripts,
    'sotoken_rule',
    [otokenPolicy.hash, sotokenPolicy.hash]
  )
  const feeClaimRule = loadValidator(
    OadaScripts,
    'fee_claim_rule',
    [otokenPolicy.hash, toPlutusData(stakingAmoId)]
  )

  // shorter aliases for log output
  const registerRules = async () =>
    newTx()
      .registerStake(otokenRule.mkRewardAddress())
      .registerStake(sotokenRule.mkRewardAddress())
      .registerStake(feeClaimRule.mkRewardAddress())
      .registerStake(depositAmo.mkRewardAddress())

  await sequenceTransactions([
    () =>
      mintIdAsAdmin(
        collateralAmo,
        toPlutusData(initialCollateralAmoDatum),
        cmSeed
      ),
    () => 
      mintIdAsAdmin(
        stakingAmo,
        toPlutusData(initialStakingAmoDatum),
        stakingAmoSeed
      ),
    () => mintIdAsAdmin(controllerWhitelist, controllerPubKeyHash),
    () => mintIdAsAdmin(amoWhitelist, otokenRule.hash),
    () => setSotokenPolicy(sotokenPolicy.hash).then(addSignature(soul.privateKey)),
    () => 
      setStakingAmoTokenName(stakingAmoTokenName)
        .then(addSignature(controllerPrivateKey))
        .then(addSignature(soul.privateKey)),
    () =>
      mintIdAsAdmin(amoWhitelist, sotokenRule.hash)
        .then(addSignature(soul.privateKey)),
    () =>
      mintIdAsAdmin(amoWhitelist, feeClaimRule.hash)
        .then(addSignature(soul.privateKey)),
    () => 
      mintIdAsAdmin(strategyWhitelist, donationStrategy.hash)
        .then(addSignature(soul.privateKey)),
    () => registerRules(),
    () =>
      spawnStrategy(donationStrategy, { kind: 'DonationDatum' }, donationSeed)
        .then(addSignature(controllerPrivateKey))
  ]).catch(handleError)
  
  //////////////////////////////////////////////////////////////////////////////
  // NO MORE ACTUAL TRANSACTIONS
  const idMap: { [id in OtokenId]: string } = {
    StakingAmo: stakingAmo.hash + stakingAmoTokenName,
    CollateralAmo: collateralAmo.hash + collateralAmoTokenName,
  }

  const strategyMap: { [strategy in OadaStrategy]: [Validator, string] } ={
    DonationStrategy: [donationStrategy, donationStrategyTokenName]
  }

  const redirectId = (id: OtokenId) => (tx: Tx): Tx => {
    const idUnit = idMap[id]
    return tx.transformOutputAssetsByNft(
      idUnit,
      assets => ({ ...assets, [idUnit]: 0n })
    )
  }

  const transformCollateralAmoAssets = (f: (_: Assets) => Assets) => (tx: Tx): Tx =>
    tx.transformOutputAssetsByNft(
      collateralAmo.hash + collateralAmoTokenName,
      f
    )

  const transformStakingAmoDatum =
    transformOutputDatumByNft(
      stakingAmoDatumSchema,
      stakingAmo.hash + stakingAmoTokenName
    )

  const transformDepositAmoOutputAssets = (f: (_: Assets) => Assets) => (tx: Tx): Tx =>
    tx.transformOutputAssetsByScriptHash(depositAmo.hash, f)

  const withoutToken = (tokenUnit: string) => async (tx: Tx): Promise<Tx> => {
    const utxo = (await lucid.wallet.getUtxos()).find(utxo => !utxo.assets[tokenUnit])
    if (!utxo)
      throw new Error("Could not select wallet input without fee claimer token")
    tx.collectFrom([utxo])
    tx.removeInputByNft(tokenUnit)
    tx.removeOutputByNft(tokenUnit)
    return tx
  }

  const withoutAdminToken =
    withoutToken(soulToken.currencySymbol + soulToken.tokenName)

  const withoutFeeClaimerToken =
    withoutToken(feeClaimerToken.currencySymbol + feeClaimerToken.tokenName)

  const withoutControllerSignature = (tx: Tx): Tx => {
    return tx.removeSignerKey(controllerPubKeyHash)
  }

  return {
    setSotokenPolicy,
    mintOtoken,
    mintSotokenFromOtoken,
    mergeDeposits,
    syncDonations,
    mergeStakingRate,
    donate,
    claimOdaoFee,
    spawnStrategy,
    fakeSpawnStrategy,
    despawnStrategy,
    scriptUtils,

    transformCollateralAmoAssets,
    transformDepositAmoOutputAssets,
    transformStakingAmoDatum,

    redirectId,
    withoutAdminToken,
    withoutFeeClaimerToken,
    withoutControllerSignature,
  }
}
