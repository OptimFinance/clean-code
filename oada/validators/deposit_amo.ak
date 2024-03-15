use aiken/dict
use aiken/list
use aiken/transaction.{ScriptContext, WithdrawFrom}
use aiken/transaction/credential.{ScriptCredential, Inline}
use aiken/transaction/value

use optim/types.{AssetClass, Id}
use optim/utils.{find_own_input, find_id_input, find_id_output}

validator(
  base_asset: AssetClass,
  collateral_amo_id: Id,
) {
  fn spend(_datum: Data, _redeemer: Data, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    expect Some(self_in) = find_own_input(purpose, tx_info.inputs)
    expect [(Inline(ScriptCredential(script_hash)), 0)] =
      dict.to_list(tx_info.withdrawals)
    self_in.output.address.payment_credential == ScriptCredential(script_hash)
  }

  fn withdraw(_redeemer: Data, ctx: ScriptContext) {
    let base_asset_of =
      value.quantity_of(_, base_asset.policy_id, base_asset.asset_name)

    let ScriptContext(tx_info, purpose) = ctx
    expect WithdrawFrom(Inline(ScriptCredential(script_hash))) = purpose
    let cm_id: Id = collateral_amo_id
    expect Some(cm_in) = find_id_input(cm_id, tx_info.inputs)
    expect Some(cm_out) = find_id_output(cm_id, tx_info.outputs)
    let cm_diff = base_asset_of(cm_out.value) - base_asset_of(cm_in.output.value)

    let deposited_collateral =
      list.foldl(
        tx_info.inputs,
        0,
        fn(input, acc) {
          if (input.output.address.payment_credential == ScriptCredential(script_hash)) {
            acc + base_asset_of(input.output.value)
          } else {
            acc
          }
        }
      )

    cm_diff >= deposited_collateral
  }
}
