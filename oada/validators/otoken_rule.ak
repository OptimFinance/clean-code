use aiken/list
use aiken/transaction.{ScriptContext, WithdrawFrom, InlineDatum}
use aiken/transaction/credential.{ScriptCredential}
use aiken/transaction/value.{PolicyId}

use optim/types.{AssetClass, ScriptHash}

// OTOKEN rule to allow minting 1:1 with base asset sent to deposit AMO.
validator (
  base_asset: AssetClass,
  otoken_policy: PolicyId,
  deposit: ScriptHash,
  minimum_mint: Int
) {
  fn withdraw(_redeemer: Data, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    when purpose is {
      WithdrawFrom(_) -> {
        let minted_value = value.from_minted_value(tx_info.mint)
        let otoken_minted = value.quantity_of(minted_value, otoken_policy, "")
        let expected_asset_count =
          if base_asset.policy_id == "" { 1 } else { 2 }
        expect Some(deposit_output) =
          list.find(
            tx_info.outputs,
            fn(output) { output.address.payment_credential == ScriptCredential(deposit) }
          )
        expect InlineDatum(datum) = deposit_output.datum
        expect Void: Void = datum
        let no_extra_assets =
          list.length(value.flatten(deposit_output.value)) == expected_asset_count
        let base_paid =
          value.quantity_of(deposit_output.value, base_asset.policy_id, base_asset.asset_name)

        and{
          (base_paid == otoken_minted)?,
          (otoken_minted >= minimum_mint)?,
          no_extra_assets?
        }
      }
      _ -> False
    }
  }
}
