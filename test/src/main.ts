import {
  PROTOCOL_PARAMETERS_DEFAULT,
  C,
  Emulator,
  Lucid,
Utils,
} from 'lucid';
import {initOtoken} from './oada.ts'
import * as hex from 'https://deno.land/std@0.216.0/encoding/hex.ts'
import { CollateralAmoDatum, StakingAmoDatum, _x } from "./datums.ts";
import { AssetClass } from "./plutus-v1-encoders.ts";
import { addSignature, newWallet, withTrace } from "./utils.ts";
import json_bigint from 'npm:json-bigint';

const JSONbig = json_bigint({
  useNativeBigInt: true
});

const lucid = await Lucid.new(undefined, 'Preview')

const randomBaseAsset = !!Deno.env.get('RANDOM_BASE_ASSET')
const baseAsset: AssetClass = {
  kind: 'AssetClass',
  currencySymbol:
    randomBaseAsset
      ? hex.encodeHex(crypto.getRandomValues(new Uint8Array(28)))
      : '',
  tokenName: 
    randomBaseAsset
      ? hex.encodeHex(crypto.getRandomValues(new Uint8Array(Math.floor(Math.random()*32))))
      : ''
}
const baseAssetUnit = (baseAsset.currencySymbol + baseAsset.tokenName) || 'lovelace'

const soulToken: AssetClass = {
  kind: 'AssetClass',
  currencySymbol: hex.encodeHex(crypto.getRandomValues(new Uint8Array(28))),
  tokenName: ''
}
const feeClaimerToken: AssetClass = {
  kind: 'AssetClass',
  currencySymbol: hex.encodeHex(crypto.getRandomValues(new Uint8Array(28))),
  tokenName: ''
}

const user = newWallet(lucid)
const soul = newWallet(lucid)
const feeClaimer = newWallet(lucid)

const controllerPrivateKey = C.PrivateKey.from_normal_bytes(crypto.getRandomValues(new Uint8Array(32)))

const initialCollateralAmoDatum: CollateralAmoDatum = {
  kind: 'CollateralAmoDatum',
  adaProfitUncommitted: 0n,
  stakingAmo: {
    kind: 'AssetClass',
    currencySymbol: '',
    tokenName: '',
  },
  childStrategies: []
}

const sotokenLimit = 100_000_000_000n
const initialStakingAmoDatum: StakingAmoDatum = {
  kind: 'StakingAmoDatum',
  sotoken: '00000000000000000000000000000000000000000000000000000000',
  sotokenAmount: 0n,
  sotokenBacking: 0n,
  sotokenLimit,
  odaoFee: 10n,
  odaoSotoken: 0n,
  feeClaimer: feeClaimerToken
}

const protocolParameters = JSONbig.parse(JSONbig.stringify(PROTOCOL_PARAMETERS_DEFAULT))
const veryBig = 1000000000n * 1000000000n
protocolParameters.maxTxSize = Number(veryBig)
protocolParameters.maxTxExSteps = veryBig
protocolParameters.maxTxExMem = veryBig
const provider = new Emulator([
  {
    address: user.address,
    assets: {
      [baseAssetUnit]: 40_000_000_000_000_000n
    }
  },
  {
    address: user.address,
    assets: {
      lovelace: 10_000_000_000n
    }
  },
  {
    address: soul.address,
    assets: {
      lovelace: 500_000_000n,
      [soulToken.currencySymbol + soulToken.tokenName]: 1n
    }
  },
  {
    address: feeClaimer.address,
    assets: {
      lovelace: 500_000_000n,
      [feeClaimerToken.currencySymbol + feeClaimerToken.tokenName]: 1n
    }
  },
], protocolParameters);

await lucid.switchProvider(provider, 'Custom')
lucid.selectWalletFromPrivateKey(user.privateKey.to_bech32())

const {
  setSotokenPolicy,
  mintOtoken,
  stakeOtokens,
  mintSotokens,
  mergeDeposits,
  syncDonations,
  mergeStakingRate,
  donate,
  fakeSpawnStrategy,
  despawnStrategy,
  claimOdaoFee,

  transformCollateralAmoAssets,
  transformDepositAmoOutputAssets,
  transformStakingAmoDatum,

  withoutAdminToken,
  withoutFeeClaimerToken,
  withoutControllerSignature,
  redirectId,
  scriptUtils: {
    sequenceTransactions,
    logResults,
    getStatus,
  }
} = await initOtoken({
  lucid,
  baseAsset,
  soul,
  feeClaimer,
  soulToken,
  controllerPrivateKey,
  initialCollateralAmoDatum,
  initialStakingAmoDatum,
  feeClaimerToken,
})

await sequenceTransactions([
  () => mintOtoken(100_000_000n),
  () => mintOtoken(60_000_000n),
  () => mintOtoken(sotokenLimit * 2n),
  () => mintOtoken(1_000_000n),
  () => mergeDeposits().then(addSignature(controllerPrivateKey)),
  () => stakeOtokens(10_000_000n),
  () => mintSotokens().then(addSignature(controllerPrivateKey)),
  () => stakeOtokens(-5_000_000n),
  () => mintSotokens().then(addSignature(controllerPrivateKey)),
  () => mintSotokens(), // NOTE: no-op transaction since no stake/unstake
  {
    label: 'Setting sOADA policy without soul token fails',
    expect: 'Fail',
    matchError: withTrace('soul_token'),
    case: () => setSotokenPolicy(user.pubKeyHash).then(withoutAdminToken),
  },
  {
    label: 'Deposit mint mismatch fails',
    expect: 'Fail',
    matchError: withTrace('base_paid == otoken_minted'),
    case: () =>
      mintOtoken(100_000_000n)
        .then(transformDepositAmoOutputAssets(assets =>
          ({ ...assets, [baseAssetUnit]: assets[baseAssetUnit] + 1n })
        ))
  },
  {
    label: 'Incorrect sOADA output amount while minting fails',
    expect: 'Fail',
    matchError: withTrace('sotoken_minted == out_datum.sotoken_amount - in_datum.sotoken_amount'),
    case: () =>
      mintSotokens(40_000_000n)
        .then(transformStakingAmoDatum(x => 
	        ({...x, sotokenAmount: x.sotokenAmount + 1n})
        ))
  },
  {
    label: 'Minting sOADA beyond limit fails',
    expect: 'Fail',
    matchError: withTrace('out_datum.sotoken_amount <= out_datum.sotoken_limit'),
    case: () => mintSotokens(sotokenLimit + 1n),
  },
  {
    label: 'Redirecting staking AMO ID while minting sOADA fails',
    expect: 'Fail',
    matchError: withTrace('burn_own_id'),
    case: () => mintSotokens(sotokenLimit + 1n).then(redirectId('StakingAmo')),
  },
  () => donate(1_000_000n),
  () => syncDonations().then(addSignature(controllerPrivateKey)),
  {
    label: 'Redirecting collateral AMO ID during `MergeStakeRate` fails',
    expect: 'Fail',
    matchError: withTrace('find_id_output'),
    case: () => mergeStakingRate().then(redirectId('CollateralAmo')),
  },
  {
    label: 'Merge staking rate without controller signature fails',
    expect: 'Fail',
    matchError: error => 
      (withTrace('controller_signed')(error) || withTrace('controller_whitelist')(error)),
    case: () => mergeStakingRate().then(withoutControllerSignature),
  },
  () => mergeStakingRate().then(addSignature(controllerPrivateKey)),
  () => stakeOtokens(10_000_101n),
  () => mintSotokens().then(addSignature(controllerPrivateKey)),
  () => stakeOtokens(sotokenLimit * 2n + 1n),
  () => mintSotokens().then(addSignature(controllerPrivateKey)),
  () => stakeOtokens(-sotokenLimit / 2n - 1n),
  () => mintSotokens().then(addSignature(controllerPrivateKey)),
  () => donate(10_000_000_000_000n),
  () => syncDonations().then(addSignature(controllerPrivateKey)),
  () => mergeStakingRate().then(addSignature(controllerPrivateKey)),
  () => despawnStrategy('DonationStrategy').then(addSignature(controllerPrivateKey)),
  ...(
    baseAssetUnit === 'lovelace' 
      ? [{
          label: 'Extract lovelace while spawning strategy fails',
          expect: 'Fail' as const,
          matchError: withTrace('no_ada_lost'),
          case: () =>
            fakeSpawnStrategy('DonationStrategy', { kind: 'DonationDatum' })
              .then(transformCollateralAmoAssets(
                assets => ({
                  ...assets,
                  lovelace: assets.lovelace - 2_000_000n
                })
              ))
              .then(addSignature(controllerPrivateKey))
        }]
      : [] 
  ),
  {
    label: 'Claim ODAO fee without fee claimer token fails',
    expect: 'Fail',
    matchError: withTrace('fee_claimer'),
    case: () =>
      claimOdaoFee()
        .then(withoutFeeClaimerToken)
        .then(addSignature(feeClaimer.privateKey))
  },
  () =>
    claimOdaoFee().then(addSignature(feeClaimer.privateKey)),
], { keepGoing: true })

provider.log()

logResults()

if (getStatus() === 'Fail')
  throw new Error('test suite failed')
