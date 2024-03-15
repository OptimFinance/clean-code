use aiken/transaction.{ScriptContext}

use optim/types.{Id}
use optim/utils.{find_id_input, get_output_datum}

use optim/types/oada.{StakingAmoDatum}

validator(staking_amo: Id) {
  fn mint(rate: (Int, Int), ctx: ScriptContext) {
    let ScriptContext(tx_info, _purpose) = ctx
    expect Some(staking_amo_input) = find_id_input(staking_amo, tx_info.inputs)
    expect staking_amo_datum: StakingAmoDatum =
      get_output_datum(staking_amo_input.output, tx_info.datums)
    or{
      staking_amo_datum.sotoken_amount == 0 && rate.1st == rate.2nd,
      and{
        rate.1st == staking_amo_datum.sotoken_backing,
        rate.2nd == staking_amo_datum.sotoken_amount,
      }
    }
  }
}
