use aiken/transaction.{ScriptContext, Mint}
use aiken/transaction/value

use optim/types.{AssetClass, Id, IdMintRedeemer, ScriptHash, MintId}
use optim/types/oada.{
  StrategyDatum,
  CollateralAmoRedeemer,
  SpawnStrategy,
  DespawnStrategy
}
use optim/utils.{
  const_,
  get_own_id,
  find_own_input,
  find_id_input,
  find_id_output,
  burn_own_id,
  mint_own_id,
  get_output_datum,
  has_whitelist_signature,
  value_increased,
  get_id_redeemer
}

type DonationStrategyRedeemer {
  CloseStrategy
  SyncStrategy
  ActionDonate
}

validator(
  controller_whitelist: ScriptHash,
  base_asset: AssetClass,
  collateral_amo_id: Id
) {
  fn mint(redeemer: IdMintRedeemer, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    expect Mint(own_policy_id) = purpose

    expect collateral_amo_redeemer: CollateralAmoRedeemer =
      get_id_redeemer(collateral_amo_id, True, tx_info.inputs, tx_info.redeemers)

    let valid_cm_spawn =
      when collateral_amo_redeemer is {
        SpawnStrategy(script_hash, out_ref) -> {
          and{
            (own_policy_id == script_hash)?,
            (redeemer == MintId(out_ref))?
          }
        }
        DespawnStrategy(_id) -> True // could check id, already checked elsewhere
        _ -> False
      }

    and{
      mint_own_id(
        redeemer,
        purpose,
        tx_info.inputs,
        tx_info.outputs,
        tx_info.mint,
        const_(True)
      )?,
      has_whitelist_signature(
        controller_whitelist,
        tx_info.reference_inputs,
        tx_info.extra_signatories,
        tx_info.datums
      )?,
      valid_cm_spawn
    }
  }

  fn spend(
    datum: StrategyDatum,
    redeemer: DonationStrategyRedeemer,
    ctx: ScriptContext
  ) {
    let ScriptContext(tx_info, purpose) = ctx
    expect Some(own_id) = get_own_id(purpose, tx_info.inputs)
    expect Some(self_in) = find_own_input(purpose, tx_info.inputs)
    
    when redeemer is {
      CloseStrategy -> {
        expect Some(collateral_amo_input) =
          find_id_input(collateral_amo_id, tx_info.inputs)
        expect Some(collateral_amo_output) =
          find_id_output(collateral_amo_id, tx_info.outputs)
        expect has_whitelist_signature(
          controller_whitelist,
          tx_info.reference_inputs,
          tx_info.extra_signatories,
          tx_info.datums
        )
        let value_returned =
          (value.merge(self_in.output.value, collateral_amo_input.output.value)
            |> value.merge(value.from_asset(own_id.policy_id, own_id.asset_name, -1)))
            == collateral_amo_output.value
        and{
          burn_own_id(purpose, tx_info.inputs, tx_info.mint)?,
          value_returned?
        }
      }
      SyncStrategy -> {
        expect has_whitelist_signature(
          controller_whitelist,
          tx_info.reference_inputs,
          tx_info.extra_signatories,
          tx_info.datums
        )
        expect Some(self_out) = find_id_output(own_id, tx_info.outputs)
        expect self_out_datum: StrategyDatum =
          get_output_datum(self_out, tx_info.datums)
        let expected_datum = StrategyDatum {
          ..datum,
          base_profit: 0,
        }
        (self_out_datum == expected_datum)?
      }
      ActionDonate -> {
        let base_asset_of =
          value.quantity_of(_, base_asset.policy_id, base_asset.asset_name)
        expect Some(self_out) = find_id_output(own_id, tx_info.outputs)
        expect self_out_datum: StrategyDatum =
          get_output_datum(self_out, tx_info.datums)
        let new_collateral =
          base_asset_of(self_out.value) - base_asset_of(self_in.output.value)
        let expected_datum = StrategyDatum {
          ..datum,
          base_profit: datum.base_profit + new_collateral,
        }

        and{
          value_increased(self_in, self_out)?,
          self_out_datum == expected_datum
        }
      }
    }
  }
}
