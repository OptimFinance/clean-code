use aiken/transaction.{ScriptContext}

use optim/types.{
  Id,
  IdMintRedeemer,
  ScriptHash,
}
use optim/utils.{
  const_,
  nft_spent,
  mint_own_id,
  find_id_output,
  find_own_input,
  get_output_datum,
  get_own_id,
  has_whitelist_signature,
  value_increased,
}

use optim/types/oada.{
  CollateralAmoDatum,
  CollateralAmoRedeemer,
  UpdateStakingAmo,
  SpawnStrategy,
  DespawnStrategy,
  SyncStrategy,
  MergeStakingRate,
  MergeNewDeposits
}
use oada/validation.{
  spawn_strategy,
  sync_strategy,
  despawn_strategy,
  merge_staking_rate,
}

validator (
  soul_token: Id,
  controller_whitelist: ScriptHash,
  strategy_whitelist: ScriptHash
) {
  fn mint(
    redeemer: IdMintRedeemer,
    ctx: ScriptContext
  ) {
    let ScriptContext(tx_info, purpose) = ctx
    and{
      mint_own_id(
        redeemer,
        purpose,
        tx_info.inputs,
        tx_info.outputs,
        tx_info.mint,
        const_(True)
      ),
      nft_spent(soul_token, tx_info.inputs)
    }
  }

  fn spend(
    datum: CollateralAmoDatum,
    redeemer: CollateralAmoRedeemer,
    ctx: ScriptContext
  ) {
    let ScriptContext(tx_info, purpose) = ctx
    expect Some(own_id) = get_own_id(purpose, tx_info.inputs)
    expect Some(self_in) = find_own_input(purpose, tx_info.inputs)
    expect Some(self_out) = find_id_output(own_id, tx_info.outputs)
    expect self_out_datum: CollateralAmoDatum =
      get_output_datum(self_out, tx_info.datums)

    expect has_whitelist_signature(
      controller_whitelist,
      tx_info.reference_inputs,
      tx_info.extra_signatories,
      tx_info.datums
    )

    when redeemer is {
      UpdateStakingAmo -> {
        let expected_datum =
          CollateralAmoDatum {
            ..datum,
            staking_amo: self_out_datum.staking_amo
          }

        and{
          nft_spent(soul_token, tx_info.inputs)?,
          value_increased(self_in, self_out)?,
          (self_out_datum == expected_datum)?
        }
      }
      SpawnStrategy(target, out_ref) ->
        spawn_strategy(
          target,
          out_ref,
          datum,
          self_out_datum,
          self_in,
          self_out,
          strategy_whitelist,
          tx_info.outputs,
          tx_info.datums,
          tx_info.reference_inputs,
          tx_info.mint
        )
      DespawnStrategy(strategy) ->
        despawn_strategy(
          strategy,
          datum,
          self_out_datum,
          self_in,
          self_out,
          strategy_whitelist,
          tx_info.inputs,
          tx_info.datums,
          tx_info.reference_inputs,
          tx_info.mint
        )
      SyncStrategy(strategy) ->
        sync_strategy(
          strategy,
          datum,
          self_out_datum,
          self_in,
          self_out,
          strategy_whitelist,
          tx_info.inputs,
          tx_info.outputs,
          tx_info.datums,
          tx_info.reference_inputs,
        )
      MergeStakingRate ->
        merge_staking_rate(
          datum,
          self_out_datum,
          self_in,
          self_out,
          tx_info.inputs,
          tx_info.outputs,
          tx_info.datums,
        )
      MergeNewDeposits ->
        and{
          value_increased(self_in, self_out)?,
          (self_out_datum == datum)?,
        }
    }
  }
}
