use aiken/math/rational
use aiken/transaction.{ScriptContext, WithdrawFrom}
use aiken/transaction/value

use optim/types.{Id, ScriptHash}
use optim/types/oada.{StakingAmoDatum}
use optim/utils.{find_id_input, find_id_output, get_output_datum}

validator (otoken_policy: ScriptHash, staking_amo: Id) {
  fn withdraw(_redeemer: Data, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    when purpose is {
      WithdrawFrom(_) -> {
        expect Some(staking_amo_input) = find_id_input(staking_amo, tx_info.inputs)
        expect staking_amo_datum_in: StakingAmoDatum = 
          get_output_datum(staking_amo_input.output, tx_info.datums)
        expect Some(staking_amo_output) = find_id_output(staking_amo, tx_info.outputs)
        expect staking_amo_datum_out: StakingAmoDatum = 
          get_output_datum(staking_amo_output, tx_info.datums)
        let minted_otoken =
          value.from_minted_value(tx_info.mint)
            |> value.quantity_of(otoken_policy, "")
        expect Some(rate) = 
          rational.new(
            staking_amo_datum_in.sotoken_amount,
            staking_amo_datum_in.sotoken_backing
          )
        let sotoken_claimed = 
          rational.from_int(minted_otoken)
            |> rational.mul(rate)
            |> rational.ceil()
        let sotoken_remaining = staking_amo_datum_in.odao_sotoken - sotoken_claimed

        and{
          (staking_amo_datum_out.odao_sotoken == sotoken_remaining)?,
          (sotoken_remaining >= 0)?,
          (sotoken_remaining < staking_amo_datum_in.odao_sotoken)?,
        }
      }
      _ -> False
    }
  }
}
