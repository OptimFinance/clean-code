use aiken/dict
use aiken/transaction.{ScriptContext}
use aiken/transaction/credential.{ScriptCredential, Inline}

use optim/types.{ScriptHash}
use optim/utils.{is_whitelisted}

validator(amo_whitelist: ScriptHash) {
  fn mint(_, ctx: ScriptContext) {
    let ScriptContext(tx_info, _) = ctx
    expect [(Inline(ScriptCredential(script_hash)), _)] =
      dict.to_list(tx_info.withdrawals)

    is_whitelisted(
      script_hash,
      amo_whitelist,
      tx_info.reference_inputs,
      tx_info.datums
    )?
  }
}
