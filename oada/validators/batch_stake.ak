use aiken/cbor.{serialise}
use aiken/dict
use aiken/hash.{blake2b_256}
use aiken/list
use aiken/option
use aiken/math/rational
use aiken/transaction.{ScriptContext, Mint, Output, Spend, InlineDatum}
use aiken/transaction/credential.{Address}
use aiken/transaction/value.{PolicyId}

use optim/utils.{find_id_input, find_own_input, get_output_datum}
use optim/types.{Id, KeyHash}

use optim/types/oada.{StakingAmoDatum}

type BatchStakeDatum {
  owner: KeyHash,
  return_address: Address
}

type BatchStakeRedeemer {
  CancelStake
  DigestStake(Int, Option<Int>)
}

validator(
  otoken_policy: PolicyId,
  staking_amo: Id,
) {
  fn spend(
    datum: BatchStakeDatum,
    redeemer: BatchStakeRedeemer,
    ctx: ScriptContext
  ) {
    let ScriptContext(tx_info, purpose) = ctx
    expect Spend(self_in_out_ref) = purpose
    expect Some(self_in) = find_own_input(purpose, tx_info.inputs)

    // allow the owner to cancel at any time, or the controller (enforced by
    // staking AMO input) to satisfy the stake/unstake order
    when redeemer is {
      CancelStake -> list.has(tx_info.extra_signatories, datum.owner)
      DigestStake(return_index, mb_continuing_order_index) -> {
        expect Some(staking_amo_in) = find_id_input(staking_amo, tx_info.inputs)
        expect staking_amo_datum: StakingAmoDatum =
          get_output_datum(staking_amo_in.output, tx_info.datums)
        expect (sotoken_backing, sotoken_amount): (Int, Int) = {
          expect Some(redeemer) = dict.get(
            tx_info.redeemers,
            Mint(staking_amo_datum.sotoken)
          )
          redeemer
        }
        expect Some(rate) = rational.new(sotoken_amount, sotoken_backing)
        expect Some(return_output) = list.at(tx_info.outputs, return_index)
        let otoken_in = value.quantity_of(self_in.output.value, otoken_policy, "")
        let sotoken_in =
          value.quantity_of(
            self_in.output.value,
            staking_amo_datum.sotoken,
            "",
          )
        let own_inputs =
          list.filter(
            tx_info.inputs,
            fn(input) { 
              input.output.address.payment_credential ==
                self_in.output.address.payment_credential
            }
          )

        // considered paid if the tokens in the input are paid at the correct
        // exchange rate to the return address. in the case that the sOTOKEN
        // limit is hit, if paid up to the limit and the remaining OTOKENs
        // included in a new order with the same datum
        //
        // intended action is inferred from tokens on the input and must be
        // exactly one of OTOKEN -> sOTOKEN or sOTOKEN -> OTOKEN
        let return_paid = 
          when (otoken_in > 0, sotoken_in > 0) is {
            (True, False) -> {
              expect Some(returned_assets) =
                list.tail(value.flatten(return_output.value))
              let sotoken_requested =
                rational.from_int(otoken_in)
                  |> rational.mul(rate)
                  |> rational.truncate()

              when mb_continuing_order_index is {
                None ->
                  (returned_assets == [(staking_amo_datum.sotoken, "", sotoken_requested)])?
                Some(continuing_order_index) -> {
                  let to_limit = 
                    staking_amo_datum.sotoken_limit - staking_amo_datum.sotoken_amount
                  let expected_sotoken_out = to_limit
                  expect Some(otoken_burned) = 
                    rational.from_int(expected_sotoken_out)
                      |> rational.div(rate)
                      |> option.map(rational.truncate)
                  let expected_otoken_out = otoken_in - otoken_burned
                  expect Some(continuing_output) =
                    list.at(tx_info.outputs, continuing_order_index)
                  expect Some(change_assets) =
                    list.tail(value.flatten(continuing_output.value))

                  and{
                    (continuing_output.address == self_in.output.address)?,
                    (continuing_output.datum == self_in.output.datum)?,
                    (change_assets == [(otoken_policy, "", expected_otoken_out)])?,
                    (returned_assets == [(staking_amo_datum.sotoken, "", expected_sotoken_out)])?,
                    (sotoken_requested > to_limit)?
                  }
                }
              }
            }
            (False, True) -> {
              expect Some(burn_fee) = rational.new(999, 1000)
              expect Some(returned_assets) =
                list.tail(value.flatten(return_output.value))
              expect Some(expected_otoken_out) =
                rational.from_int(sotoken_in)
                  |> rational.div(rate)
                  |> option.map(rational.mul(burn_fee, _))
                  |> option.map(rational.truncate)

              returned_assets == [(otoken_policy, "", expected_otoken_out)]
            }
            (_, _) -> False
          }

        and{
          return_paid,
          (list.length(own_inputs) == 1)?,
          (return_output.address == datum.return_address)?,
          (return_output.datum ==
            InlineDatum(self_in_out_ref |> serialise |> blake2b_256))?
        }
      }
    }
  }
}
