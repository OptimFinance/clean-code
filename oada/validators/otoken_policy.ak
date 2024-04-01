use aiken/dict
use aiken/transaction.{Mint, ScriptContext}
use aiken/transaction/credential.{ScriptCredential, Inline}
use aiken/transaction/value

use optim/types.{ScriptHash}
use optim/utils.{is_whitelisted}

validator(amo_whitelist: ScriptHash) {
  fn mint(_, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    expect Mint(own_policy_id) = purpose
    expect [(Inline(ScriptCredential(script_hash)), _)] =
      dict.to_list(tx_info.withdrawals)
    let own_tokens =
      tx_info.mint
        |> value.from_minted_value
        |> value.tokens(own_policy_id)
    let rule_whitelisted =
      is_whitelisted(
        script_hash,
        amo_whitelist,
        tx_info.reference_inputs,
        tx_info.datums
      )?

    and{
      rule_whitelisted,
      dict.keys(own_tokens) == [""]
    }
  }
}
