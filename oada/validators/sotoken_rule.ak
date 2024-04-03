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
        let sotoken_policy = staking_amo_datum.sotoken
        let minted_value = value.from_minted_value(tx_info.mint)
        let sotoken_minted = value.quantity_of(minted_value, sotoken_policy, "")
        let otoken_minted = value.quantity_of(minted_value, otoken_policy, "")
        expect mint_redeemer: (Int, Int) = {
          expect Some(redeemer) = dict.get(tx_info.redeemers, Mint(sotoken_policy))
          redeemer
        }
        let correct_rate =
          or{
            and{
              staking_amo_datum.sotoken_amount == 0,
              mint_redeemer.1st == mint_redeemer.2nd,
            },
            and{
              mint_redeemer.1st == staking_amo_datum.sotoken_backing,
              mint_redeemer.2nd == staking_amo_datum.sotoken_amount,
            },
          }
        expect Some(rate) = rational.new(mint_redeemer.1st, mint_redeemer.2nd) 
        expect Some(burn_fee) =
          rational.new(if sotoken_minted < 0 { 999 } else { 1000 }, 1000)
        let expected_mint = 
          rational.from_int(-sotoken_minted)
            |> rational.mul(rate)
            |> rational.mul(burn_fee)
            |> rational.truncate()

        and{
          (otoken_minted == expected_mint)?,
          correct_rate,
        }
      }
      _ -> False
    }
  }
}
