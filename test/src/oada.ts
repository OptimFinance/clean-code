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
import {addSignature, handleError, mkScriptUtils, newWallet, wrapRedeemer} from './utils.ts'

import {
  CollateralAmoDatum,
  CollateralAmoRedeemer,
  DonationDatum,
  MintNft,
  BatchStakeDatum,
  StakingAmoDatum,
  StrategyDatum,
  _x,
  collateralAmoDatumSchema,
  batchStakeDatumSchema,
  stakingAmoDatumSchema,
  strategyDatumSchema,
  toWrappedData,
BatchStakeRedeemer
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
  const utils = new L.Utils(lucid)
  const scriptUtils = mkScriptUtils(lucid)

  const {
    loadValidator,
    sequenceTransactions,
  } = scriptUtils;

  const epochBoundary = 1_647_899_091_000n
  const epochLength = 432_000_000n
  const baseAssetUnit = (baseAsset.currencySymbol + baseAsset.tokenName) || 'lovelace'
  const soulTokenData = toPlutusData(soulToken)
  const otokenRuleWhitelist = loadValidator(UtilScripts, 'whitelist', [soulTokenData, 0n])
  const sotokenRuleWhitelist = loadValidator(UtilScripts, 'whitelist', [soulTokenData, 1n])
  const controllerWhitelist = loadValidator(UtilScripts, 'whitelist', [soulTokenData, 2n])
  const strategyWhitelist = loadValidator(UtilScripts, 'whitelist', [soulTokenData, 3n])
  const collateralAmo = loadValidator(OadaScripts, 'collateral_amo', [soulTokenData, controllerWhitelist.hash, strategyWhitelist.hash])
  const otokenPolicy = loadValidator(OadaScripts, 'otoken_policy', [otokenRuleWhitelist.hash])
  const sotokenPolicy = loadValidator(OadaScripts, 'otoken_policy', [sotokenRuleWhitelist.hash])

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

  const utxoDatum = async(utxo: L.UTxO): Promise<L.Data | null> => {
    const datum = 
      utxo.datum
        ? utxo.datum
        : utxo.datumHash
          ? await lucid.provider.getDatum(utxo.datumHash!)
          : null
    return datum ? Data.from(datum) : null
  }

  const forceUtxoDatum = async(utxo: L.UTxO): Promise<L.Data> => {
    return (await utxoDatum(utxo))!
  }

  const referenceWhitelist = async(whitelist: Validator, hash?: string): Promise<Tx> => {
    const whitelistUtxos = await lucid.utxosAt(whitelist.mkAddress())
    return newTx()
      .readFrom(whitelistUtxos.filter(async utxo => !hash || await utxoDatum(utxo) === hash))
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
      .compose(await referenceWhitelist(otokenRuleWhitelist, otokenRule.hash))
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
        { inline: Data.to(await forceUtxoDatum(cmUtxo)) },
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
      fromPlutusData(strategyDatumSchema, await forceUtxoDatum(donationUtxo))
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
          strategy, 
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
      fromPlutusData(collateralAmoDatumSchema, await forceUtxoDatum(cmUtxo))
    collateralAmoDatum.childStrategies.unshift({
      kind: 'AssetClass',
      currencySymbol: strategy.hash,
      tokenName: strategyTokenName
    })
    const tx = newTx()
      .compose(mintTx)
      .compose(await signByController())
      .compose(await referenceWhitelist(strategyWhitelist, strategy.hash))
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
    profit: bigint,
    deposited: bigint = profit
  ): Promise<Tx> => {
    const cmUtxo = await getCmUtxo()
    const previousDatum: CollateralAmoDatum =
      fromPlutusData(collateralAmoDatumSchema, await forceUtxoDatum(cmUtxo))
    const redeemer: CollateralAmoRedeemer = {
      kind: 'SyncStrategyCollateral',
      id: {
        kind: 'AssetClass',
        currencySymbol: strategyId.policyId,
        tokenName: strategyId.tokenName
      }
    }
    return newTx()
      .compose(await signByController())
      .compose(await referenceWhitelist(strategyWhitelist, strategyId.policyId))
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
          [baseAssetUnit]: cmUtxo.assets[baseAssetUnit] + deposited
        }
      )
  }

  const despawnStrategy = async (strategyId: OadaStrategy): Promise<Tx> => {
    const [strategy, strategyTokenName] = strategyMap[strategyId]
    const cmUtxo = await getCmUtxo()
    const cmDatum: CollateralAmoDatum =
      fromPlutusData(collateralAmoDatumSchema, await forceUtxoDatum(cmUtxo))
    const strategyUtxo =
      await lucid.utxoByUnit(strategy.hash + strategyTokenName)
    const strategyDatum: StrategyDatum =
      fromPlutusData(strategyDatumSchema, await forceUtxoDatum(strategyUtxo))
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
      fromPlutusData(strategyDatumSchema, await forceUtxoDatum(donationUtxo))
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
      .compose(await syncStrategy(donationId, totalDonations))
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
  }

  const mergeStakingRate = async (): Promise<Tx> => {
    const stakingAmoUtxo = await getStakingAmoUtxo()
    const previousStakingDatum: StakingAmoDatum =
      fromPlutusData(stakingAmoDatumSchema, await forceUtxoDatum(stakingAmoUtxo))
    const previousSotokenAmount = previousStakingDatum.sotokenAmount || 1n
    const previousSotokenBacking = previousStakingDatum.sotokenBacking || 1n
    const previousOdaoSotoken = previousStakingDatum.odaoSotoken
    const adaToSotoken = (n: bigint) => n * previousSotokenAmount / previousSotokenBacking
    const odaoFee = previousStakingDatum.odaoFee
    const cmUtxo = await getCmUtxo()
    const previousCmDatum: CollateralAmoDatum =
      fromPlutusData(collateralAmoDatumSchema, await forceUtxoDatum(cmUtxo))
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
      fromPlutusData(stakingAmoDatumSchema, await forceUtxoDatum(stakingAmoUtxo))
    const sotokenAmount = previousStakingDatum.sotokenAmount || 1n
    const sotokenBacking = previousStakingDatum.sotokenBacking || 1n
    const odaoSotoken = previousStakingDatum.odaoSotoken
    const newStakingDatum: StakingAmoDatum = {
      ...previousStakingDatum,
      odaoSotoken: 0n,
      sotokenAmount: previousStakingDatum.sotokenAmount - previousStakingDatum.odaoSotoken
    }
    return newTx()
      .compose(await includeFeeClaimerToken())
      .compose(await referenceWhitelist(otokenRuleWhitelist, feeClaimRule.hash))
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
      fromPlutusData(stakingAmoDatumSchema, await forceUtxoDatum(stakingAmoInput))
    const newDatum: StakingAmoDatum = {
      ...previousDatum,
      sotoken: sotokenPolicy,
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
      fromPlutusData(collateralAmoDatumSchema, await forceUtxoDatum(cmUtxo))
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

  const stakeOtokens = async (amount: bigint): Promise<Tx> => {
    const { paymentCredential } = utils.getAddressDetails(await lucid.wallet.address())
    const datum: BatchStakeDatum = {
      kind: 'BatchStakeDatum',
      owner: paymentCredential!.hash,
      returnAddress: {
        kind: 'Address',
        paymentCredential: {
          kind: 'PubKeyCredential',
          hash: paymentCredential!.hash
        },
        stakingCredential: {
          kind: 'Nothing'
        }
      }
    }
    return new Promise(resolve => {
      resolve(newTx()
        .payToContract(
          batchStake.mkAddress(),
          { inline: Data.to(toPlutusData(datum)) },
          {
            [otokenPolicy.hash]: amount < 0n ? 0n : amount,
            [sotokenPolicy.hash]: amount < 0n ? -amount : 0n
          }
        )
      )
    })
  }

  const sotokenRate = async(): Promise<number> => {
    const stakingAmoUtxo = await getStakingAmoUtxo()
    const stakingAmoDatum = fromPlutusData(stakingAmoDatumSchema, await forceUtxoDatum(stakingAmoUtxo))
    return Number(stakingAmoDatum.sotokenAmount || 1n) / Number(stakingAmoDatum.sotokenBacking || 1n)
  }

  const mintSotokens = async (amount?: bigint): Promise<Tx> => {
    const stakeUtxos = await lucid.utxosAt(batchStake.mkAddress())
    const stakingAmoUtxo = await getStakingAmoUtxo()
    const previousDatum = fromPlutusData(stakingAmoDatumSchema, await forceUtxoDatum(stakingAmoUtxo))
    const previousSotokenAmount = previousDatum.sotokenAmount
    const previousSotokenBacking = previousDatum.sotokenBacking
    const sotokenToOtoken = (n: bigint, burnFee = 1000n) =>
      previousSotokenBacking == 0n
        ? n * burnFee / 1000n
        : n * previousSotokenBacking * burnFee / previousSotokenAmount / 1000n
    const otokenToSotoken = (n: bigint) =>
      previousSotokenBacking == 0n
        ? n
        : n * previousSotokenAmount / previousSotokenBacking

    const {
      tx: payoutTx,
      amountDelta
    } = stakeUtxos.reduce((acc, stakeUtxo) => {
      let {tx, amountDelta, outputIndex, hitLimit, done} = acc

      const otokenSent = stakeUtxo.assets[otokenPolicy.hash]
      const sotokenSent = stakeUtxo.assets[sotokenPolicy.hash]

      if (done || (hitLimit && otokenSent > 0n))
        return acc

      const datum = fromPlutusData(batchStakeDatumSchema, Data.from(stakeUtxo.datum!))
      const returnAddress = utils.credentialToAddress(
        {
          type:
            datum.returnAddress.paymentCredential.kind == 'PubKeyCredential'
              ? 'Key'
              : 'Script',
          hash: datum.returnAddress.paymentCredential.hash
        },
        datum.returnAddress.stakingCredential.kind == 'JustStakingCredential'
          && datum.returnAddress.stakingCredential.stakingCredential.kind == 'StakingHash'
          ? {
              type: datum.returnAddress.stakingCredential.stakingCredential.credential.kind == 'PubKeyCredential'
                  ? 'Key'
                  : 'Script',
              hash: datum.returnAddress.stakingCredential.stakingCredential.credential.hash
            }
          : undefined,
      )
      const returnDatum = Data.to(toPlutusData(utxoToTokenName(stakeUtxo)))

      if (otokenSent > 0n) {
        const sotokenRequested = otokenToSotoken(otokenSent)
        const sotokenRemaining =
          previousDatum.sotokenLimit - previousDatum.sotokenAmount
        const sotokenAmount =
          sotokenRemaining < sotokenRequested
            ? sotokenRemaining
            : sotokenRequested
        hitLimit ||= sotokenAmount < sotokenRequested

        const otokenAmount = sotokenToOtoken(sotokenAmount)
        const otokenChange = otokenSent - otokenAmount

        amountDelta += sotokenAmount
        const redeemer: BatchStakeRedeemer = {
          kind: 'DigestStake',
          returnIndex: outputIndex,
          continuingOrderIndex: 
            hitLimit
              ? { kind: 'JustBigInt', value: outputIndex + 1n }
              : { kind: 'Nothing' }
        }

        tx.attachSpendingValidator(batchStake.validator)
          .collectFrom([stakeUtxo], Data.to(toPlutusData(redeemer)))
          .mintAssets({
            [otokenPolicy.hash]: -otokenAmount
          }, Data.void())
          .mintAssets(
            { [sotokenPolicy.hash]: sotokenAmount },
            Data.to([previousSotokenBacking || 1n, previousSotokenAmount || 1n])
          )
          .payToAddressWithData(
            returnAddress,
            { inline: returnDatum },
            { [sotokenPolicy.hash]: sotokenAmount }
          )

        if (hitLimit)
          tx.payToAddressWithData(
            batchStake.mkAddress(),
            { inline: Data.to(toPlutusData(datum)) },
            { [otokenPolicy.hash]: otokenChange }
          )
      } else if (sotokenSent > 0n) {
        const otokenAmount = sotokenToOtoken(sotokenSent, 999n)
        const sotokenAmount = sotokenSent

        amountDelta -= sotokenAmount
        const redeemer: BatchStakeRedeemer = {
          kind: 'DigestStake',
          returnIndex: outputIndex,
          continuingOrderIndex: { kind: 'Nothing' }
        }

        tx.attachSpendingValidator(batchStake.validator)
          .collectFrom([stakeUtxo], Data.to(toPlutusData(redeemer)))
          .mintAssets({
            [otokenPolicy.hash]: otokenAmount
          }, Data.void())
          .mintAssets(
            { [sotokenPolicy.hash]: -sotokenAmount },
            Data.to([previousSotokenBacking, previousSotokenAmount])
          )
          .payToAddressWithData(
            returnAddress,
            { inline: returnDatum },
            { [otokenPolicy.hash]: otokenAmount }
          )
      }
      return {
        tx,
        amountDelta,
        outputIndex: outputIndex + 1n,
        hitLimit,
        done: true
      }
    }, {
      tx: newTx(),
      amountDelta: 0n,
      outputIndex: 0n,
      hitLimit: previousDatum.sotokenAmount >= previousDatum.sotokenLimit,
      done: false
    })

    const singleMintTx =
      amount === undefined
        ? newTx()
        : newTx()
            .mintAssets({
              [otokenPolicy.hash]: sotokenToOtoken(-amount) * (amount < 0n ? 999n : 1000n) / 1000n
            }, Data.void())
            .mintAssets(
              { [sotokenPolicy.hash]: amount },
              Data.to([previousSotokenBacking || 1n, previousSotokenAmount || 1n])
            )

    if (!amount && stakeUtxos.length === 0) {
      return newTx()
    }

    const newDatum: StakingAmoDatum = {
      ...previousDatum,
      sotokenAmount: previousSotokenAmount + (amount === undefined ? amountDelta : amount),
      sotokenBacking: previousSotokenBacking + (amount === undefined ? sotokenToOtoken(amountDelta) : sotokenToOtoken(amount))
    }
    return newTx()
      .compose(amount === undefined ? payoutTx : singleMintTx)
      .compose(await signByController())
      .attachMintingPolicy(sotokenPolicy.validator)
      .attachMintingPolicy(otokenPolicy.validator)
      .attachWithdrawalValidator(sotokenRule.validator)
      .attachSpendingValidator(stakingAmo.validator)
      .compose(await referenceWhitelist(otokenRuleWhitelist, sotokenRule.hash))
      .compose(await referenceWhitelist(sotokenRuleWhitelist, sotokenRule.hash))
      .withdraw(sotokenRule.mkRewardAddress(), 0n, Data.void())
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
    [soulTokenData, toPlutusData(collateralAmoId), controllerWhitelist.hash]
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
  const batchStake = loadValidator(
    OadaScripts,
    'batch_stake',
    [otokenPolicy.hash, toPlutusData(stakingAmoId)]
  )
  const sotokenRule = loadValidator(
    OadaScripts,
    'sotoken_rule',
    [otokenPolicy.hash, toPlutusData(stakingAmoId)]
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
    () => mintIdAsAdmin(otokenRuleWhitelist, otokenRule.hash),
    () => setSotokenPolicy(sotokenPolicy.hash).then(addSignature(soul.privateKey)),
    () => 
      setStakingAmoTokenName(stakingAmoTokenName)
        .then(addSignature(controllerPrivateKey))
        .then(addSignature(soul.privateKey)),
    () =>
      mintIdAsAdmin(otokenRuleWhitelist, sotokenRule.hash)
        .then(addSignature(soul.privateKey)),
    () =>
      mintIdAsAdmin(sotokenRuleWhitelist, sotokenRule.hash)
        .then(addSignature(soul.privateKey)),
    () =>
      mintIdAsAdmin(otokenRuleWhitelist, feeClaimRule.hash)
        .then(addSignature(soul.privateKey)),
    () =>
      mintIdAsAdmin(strategyWhitelist, donationStrategy.hash)
        .then(addSignature(soul.privateKey)),
    () => registerRules(),
    () =>
      spawnStrategy(donationStrategy, { kind: 'DonationDatum' }, donationSeed)
        .then(addSignature(controllerPrivateKey)),
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
    epochBoundary,
    epochLength,

    sotokenRate,
    setSotokenPolicy,
    mintOtoken,
    mintSotokens,
    mergeDeposits,
    syncDonations,
    mergeStakingRate,
    donate,
    claimOdaoFee,
    stakeOtokens,
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
