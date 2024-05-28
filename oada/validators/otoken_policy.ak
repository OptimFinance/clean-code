use aiken/dict
use aiken/list
use aiken/pairs
use aiken/transaction.{Mint, ScriptContext}
use aiken/transaction/credential.{ScriptCredential, StakeCredential, Inline}
use aiken/transaction/value

use optim/types.{ScriptHash}
use optim/utils.{is_whitelisted}

// Minting policy for both OTOKEN and sOTOKEN, provided with distinct rule
// whitelists.
validator(amo_whitelist: ScriptHash) {
  fn mint(_redeemer: Data, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    expect Mint(own_policy_id) = purpose
    let own_tokens =
      tx_info.mint
        |> value.from_minted_value
        |> value.tokens(own_policy_id)
    let rule_whitelisted =
      pairs.keys(tx_info.withdrawals)
        |> list.any(
          fn(stake_cred: StakeCredential) {
            when stake_cred is {
              Inline(ScriptCredential(script_hash)) ->
                is_whitelisted(
                  script_hash,
                  amo_whitelist,
                  tx_info.reference_inputs,
                  tx_info.datums
                )?
              _ -> False
            }
          }
        )

    and{
      rule_whitelisted?,
      (dict.keys(own_tokens) == [""])?
    }
  }
}
