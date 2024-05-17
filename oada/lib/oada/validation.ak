use aiken/cbor
use aiken/hash.{blake2b_256}
use aiken/list
use aiken/dict.{Dict}
use aiken/math/rational
use aiken/transaction.{
  Input,
  Output,
  OutputReference,
  ScriptPurpose,
  Redeemer,
  Mint
}
use aiken/transaction/value.{MintedValue}

use optim/types.{DataMap, Id, AssetClass, KeyHash, ScriptHash}
use optim/utils.{
  find_id_input,
  find_id_output,
  get_output_datum,
  is_whitelisted,
  get_id_redeemer,
  has_whitelist_signature,
  require_delete,
}

use optim/types/oada.{
  StakingAmoDatum,
  StrategyDatum,
  CollateralAmoDatum,
  CollateralAmoRedeemer,
  MergeStakingRate
}

pub fn update_sotoken_amount(
  in_datum: StakingAmoDatum,
  out_datum: StakingAmoDatum,
  collateral_amo_id: Id,
  controller_whitelist: ScriptHash,
  inputs: List<Input>,
  mint: MintedValue,
  extra_signatories: List<KeyHash>,
  datums: DataMap,
  redeemers: Dict<ScriptPurpose, Redeemer>,
  reference_inputs: List<Input>
) {
  expect has_whitelist_signature(
    controller_whitelist,
    reference_inputs,
    extra_signatories,
    datums
  )

  // two valid cases for updating the sOTOKEN amounts:
  //
  // 1) real sOTOKEN is being minted or burned inversely to OTOKEN, updating
  //    sotoken_amount and sotoken_backing accordingly
  //
  // 2) profit from the collateral management AMO is merged into the staking
  //    AMO as a change in sotoken_backing, virtually minting an sOTOKEN fee
  //    for the ODAO on this profit as a change in sotoken_amount
  when dict.get(redeemers, Mint(out_datum.sotoken)) is {
    Some(redeemer) -> {
      let sotoken_minted =
        value.from_minted_value(mint)
          |> value.quantity_of(out_datum.sotoken, "")
      expect (sotoken_backing, sotoken_amount): (Int, Int) = redeemer
      expect Some(rate) = rational.new(sotoken_backing, sotoken_amount)
      let expected_backing_delta =
        rational.from_int(sotoken_minted)
          |> rational.mul(rate)
          |> rational.truncate()


      and{
        (sotoken_minted == out_datum.sotoken_amount - in_datum.sotoken_amount)?,
        (expected_backing_delta == out_datum.sotoken_backing - in_datum.sotoken_backing)?,
        or{
          out_datum.sotoken_amount < in_datum.sotoken_amount,
          out_datum.sotoken_amount <= out_datum.sotoken_limit
        }?
      }
    }
    None -> {
      expect collateral_amo_redeemer: CollateralAmoRedeemer =
        get_id_redeemer(collateral_amo_id, True, inputs, redeemers)
      let backing_delta = out_datum.sotoken_backing - in_datum.sotoken_backing
      let sotoken_delta =
        (backing_delta * out_datum.odao_fee / 10000)
          * in_datum.sotoken_amount
          / in_datum.sotoken_backing

      and{
        (collateral_amo_redeemer == MergeStakingRate)?,
        or{
          and{
            backing_delta <= 0,
            out_datum.sotoken_amount == in_datum.sotoken_amount,
            out_datum.odao_sotoken == in_datum.odao_sotoken,
          },
          and{
            out_datum.sotoken_amount - in_datum.sotoken_amount == sotoken_delta,
            out_datum.odao_sotoken - in_datum.odao_sotoken == sotoken_delta
          }
        }?
      }
    }
  }
}

// deploys a new strategy from a whitelisted script with no profit, possibly
// providing funds to the new strategy from the collateral management AMO
pub fn spawn_strategy(
  target: ScriptHash,
  out_ref: OutputReference,
  self_in_datum: CollateralAmoDatum,
  self_out_datum: CollateralAmoDatum,
  self_in: Input,
  self_out: Output,
  strategy_whitelist: ScriptHash,
  outputs: List<Output>,
  datums: DataMap,
  reference_inputs: List<Input>,
  mint: MintedValue,
) {
  let token_name = blake2b_256(cbor.serialise(out_ref))
  let strategy = AssetClass(target, token_name)

  let strategy_minted =
    dict.to_list(value.tokens(value.from_minted_value(mint), strategy.policy_id))
      == [(token_name, 1)]
  expect Some(strategy_output) = find_id_output(strategy, outputs)
  expect strategy_datum: StrategyDatum =
    get_output_datum(strategy_output, datums)
  let expected_datum = CollateralAmoDatum {
    ..self_in_datum,
    child_strategies: list.push(self_in_datum.child_strategies, strategy)
  }
  let value_before =
    value.merge(
      self_in.output.value,
      value.from_asset(strategy.policy_id, strategy.asset_name, 1)
    )
  let value_after = value.merge(self_out.value, strategy_output.value)
  let no_ada_lost =
    value.lovelace_of(value_after) >= value.lovelace_of(value_before)
  let no_extra_assets =
    value.without_lovelace(value_before) == value.without_lovelace(value_after)

  and{
    strategy_minted?,
    is_whitelisted(
      strategy.policy_id,
      strategy_whitelist,
      reference_inputs,
      datums
    )?,
    (strategy_datum.base_profit == 0)?,
    (self_out_datum == expected_datum)?,
    no_ada_lost?,
    no_extra_assets?
  }
}

// destroys a deployed strategy and returns all funds and uncommitted profit
// to the collateral management AMO
pub fn despawn_strategy(
  strategy: Id,
  self_in_datum: CollateralAmoDatum,
  self_out_datum: CollateralAmoDatum,
  self_in: Input,
  self_out: Output,
  strategy_whitelist: ScriptHash,
  inputs: List<Input>,
  datums: DataMap,
  reference_inputs: List<Input>,
  mint: MintedValue,
) {
  expect Some(strategy_input) = find_id_input(strategy, inputs)
  expect strategy_datum: StrategyDatum =
    get_output_datum(strategy_input.output, datums)

  let assets_returned =
    self_out.value ==
      (value.from_asset(strategy.policy_id, strategy.asset_name, 1)
        |> value.negate
        |> value.merge(_, strategy_input.output.value)
        |> value.merge(_, self_in.output.value)
      )
  let strategy_burned =
    value.quantity_of(
      value.from_minted_value(mint),
      strategy.policy_id,
      strategy.asset_name
    ) == -1
  let expected_datum = CollateralAmoDatum {
    ..self_in_datum,
    base_profit_uncommitted:
      self_in_datum.base_profit_uncommitted + strategy_datum.base_profit,
    child_strategies: require_delete(self_in_datum.child_strategies, strategy)
  }

  and{
    (self_out_datum == expected_datum)?,
    is_whitelisted(
      strategy.policy_id,
      strategy_whitelist,
      reference_inputs,
      datums
    )?,
    assets_returned?,
    strategy_burned?,
  }
}

// accounts for profit from a given strategy in the collateral management AMO,
// optionally moving funds between the two
pub fn sync_strategy(
  strategy: Id,
  self_in_datum: CollateralAmoDatum,
  self_out_datum: CollateralAmoDatum,
  self_in: Input,
  self_out: Output,
  strategy_whitelist: ScriptHash,
  inputs: List<Input>,
  outputs: List<Output>,
  datums: DataMap,
  reference_inputs: List<Input>,
) {
  expect Some(strategy_input) = find_id_input(strategy, inputs)
  expect Some(strategy_output) = find_id_output(strategy, outputs)
  expect strategy_input_datum: StrategyDatum =
    get_output_datum(strategy_input.output, datums)
  expect strategy_output_datum: StrategyDatum =
    get_output_datum(strategy_output, datums)

  let strategy_profit_zeroed = strategy_output_datum.base_profit == 0
  let expected_datum: CollateralAmoDatum = CollateralAmoDatum {
    ..self_in_datum,
    base_profit_uncommitted:
      self_in_datum.base_profit_uncommitted + strategy_input_datum.base_profit
  }
  let value_before =
    value.merge(self_in.output.value, strategy_input.output.value)
  let value_after =
    value.merge(self_out.value, strategy_output.value)
  let no_ada_lost =
    value.lovelace_of(value_after) >= value.lovelace_of(value_before)
  let no_assets_leaked =
    value.without_lovelace(value_before) == value.without_lovelace(value_after)
  let is_child_strategy =
    list.has(self_in_datum.child_strategies, strategy)

  and{
    (self_out_datum == expected_datum)?,
    is_whitelisted(
      strategy.policy_id,
      strategy_whitelist,
      reference_inputs,
      datums
    )?,
    strategy_profit_zeroed?,
    no_ada_lost?,
    no_assets_leaked?,
    is_child_strategy?,
  }
}

// accounts for profit from the collateral management AMO in the staking AMO,
// updating the sOTOKEN backing and, thereby, the OTOKEN/sOTOKEN exchange rate
pub fn merge_staking_rate(
  self_in_datum: CollateralAmoDatum,
  self_out_datum: CollateralAmoDatum,
  self_in: Input,
  self_out: Output,
  inputs: List<Input>,
  outputs: List<Output>,
  datums: DataMap,
) {
  let staking_amo_profit_updated = {
    expect Some(staking_amo_input) =
      find_id_input(self_in_datum.staking_amo, inputs)
    expect Some(staking_amo_output) =
      find_id_output(self_in_datum.staking_amo, outputs)

    expect input_datum: StakingAmoDatum =
      get_output_datum(staking_amo_input.output, datums)
    expect output_datum: StakingAmoDatum =
      get_output_datum(staking_amo_output, datums)

    output_datum.sotoken_backing
      == input_datum.sotoken_backing + self_in_datum.base_profit_uncommitted
  }

  let expected_datum =
    CollateralAmoDatum {
      ..self_in_datum,
      base_profit_uncommitted: 0
    }

  and{
    staking_amo_profit_updated?,
    (self_out_datum == expected_datum)?,
    (self_in.output.value == self_out.value)?
  }
}
