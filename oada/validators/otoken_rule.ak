use aiken/list
use aiken/transaction.{ScriptContext, WithdrawFrom, InlineDatum}
use aiken/transaction/credential.{ScriptCredential}
use aiken/transaction/value.{PolicyId}

use optim/types.{AssetClass, ScriptHash}

validator (
  base_asset: AssetClass,
  otoken_policy: PolicyId,
  deposit: ScriptHash
) {
  fn withdraw(_redeemer: Data, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    when purpose is {
      WithdrawFrom(_) -> {
        let minted_value = value.from_minted_value(tx_info.mint)
        let otoken_minted = value.quantity_of(minted_value, otoken_policy, "")
        let base_paid =
          list.foldl(
            tx_info.outputs,
            0,
            fn(output, acc) {
              if output.address.payment_credential == ScriptCredential(deposit) {
                expect InlineDatum(datum) = output.datum
                expect Void: Void = datum
                acc + value.quantity_of(output.value, base_asset.policy_id, base_asset.asset_name)
              } else {
                acc
              }
            }
          )
        (base_paid == otoken_minted)?
      }
      _ -> False
    }
  }
}
