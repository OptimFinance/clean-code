use aiken/dict
use aiken/math/rational
use aiken/transaction.{ScriptContext, WithdrawFrom, Mint}
use aiken/transaction/value.{PolicyId}

use optim/types.{ScriptHash}

validator (otoken_policy: PolicyId, sotoken_policy: ScriptHash) {
  fn withdraw(_redeemer: Data, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    when purpose is {
      WithdrawFrom(_) -> {
        let minted_value = value.from_minted_value(tx_info.mint)
        let sotoken_minted = value.quantity_of(minted_value, sotoken_policy, "")
        let otoken_minted = value.quantity_of(minted_value, otoken_policy, "")
        expect (rate_numerator, rate_denominator): (Int, Int) = {
          expect Some(redeemer) = dict.get(tx_info.redeemers, Mint(sotoken_policy))
          redeemer
        }
        expect Some(rate) = rational.new(rate_numerator, rate_denominator) 
        expect Some(burn_fee) =
          rational.new(if sotoken_minted < 0 { 999 } else { 1000 }, 1000)
        let expected_mint = 
          rational.from_int(-sotoken_minted)
            |> rational.mul(rate)
            |> rational.mul(burn_fee)
            |> rational.truncate()

        (otoken_minted == expected_mint)?
      }
      _ -> False
    }
  }
}
