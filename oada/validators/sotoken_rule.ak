use aiken/dict
use aiken/math/rational
use aiken/transaction.{ScriptContext, WithdrawFrom, Mint}
use aiken/transaction/value.{PolicyId}

use optim/types.{Id}
use optim/types/oada.{StakingAmoDatum}
use optim/utils.{find_id_input, get_output_datum}

validator (
  otoken_policy: PolicyId,
  staking_amo: Id
) {
  fn withdraw(_redeemer: Data, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    when purpose is {
      WithdrawFrom(_) -> {
        expect Some(staking_amo_in) = find_id_input(staking_amo, tx_info.inputs)
        expect staking_amo_datum: StakingAmoDatum =
          get_output_datum(staking_amo_in.output, tx_info.datums)
        let sotoken_policy = staking_amo_datum.sotoken.policy_id
        let sotoken_name = staking_amo_datum.sotoken.asset_name
        let minted_value = value.from_minted_value(tx_info.mint)
        let sotoken_minted =
          value.quantity_of(minted_value, sotoken_policy, sotoken_name)
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
