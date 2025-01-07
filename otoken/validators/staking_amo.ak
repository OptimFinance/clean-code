use aiken/list
use aiken/pairs
use aiken/transaction.{
  ScriptContext,
}
use aiken/transaction/credential.{Inline, ScriptCredential}
use aiken/transaction/value

use optim/types.{Id, IdMintRedeemer, ScriptHash}
use optim/utils.{
  const_,
  get_own_id,
  nft_spent,
  mint_own_id,
  burn_own_id,
  find_id_output,
  get_output_datum,
}

use optim/types/oada.{StakingAmoDatum}
use oada/validation.{
  update_sotoken_amount,
}

// AMO to account for circulating supply of sOTOKEN and OTOKEN/sOTOKEN exchange
// rate.
validator (
  soul_token: Id,
  collateral_amo_id: Id,
  controller_whitelist: ScriptHash,
) {
  fn mint(redeemer: IdMintRedeemer, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    and{
      mint_own_id(
        redeemer,
        purpose,
        tx_info.inputs,
        tx_info.outputs,
        tx_info.mint,
        const_(True)
      ),
      nft_spent(soul_token, ctx.transaction.inputs)
    }
  }

  fn spend(datum: StakingAmoDatum, _redeemer: Data, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    expect Some(own_id) = get_own_id(purpose, tx_info.inputs)
    
    when find_id_output(own_id, tx_info.outputs) is {
      None -> 
        and{
          burn_own_id(purpose, tx_info.inputs, tx_info.mint)?,
          nft_spent(soul_token, ctx.transaction.inputs)?
        }
      Some(self_out) -> {
        expect out_datum: StakingAmoDatum = get_output_datum(self_out, tx_info.datums)
        let no_extra_assets = list.length(value.flatten(self_out.value)) == 2
        and{
          // restriction ensures no-ops fail and that any staking AMO spends
          // are appropriately authorised
          (datum != out_datum)?,
          no_extra_assets?,

          // can be read as rules `(not P) or Q`/`P implies Q` for updating
          // each of the fields in the staking AMO datum
          //
          // e.g. datum.sotoken != out_datum.sotoken => nft_spent(soul_token, inputs)
          //  <=> !nft_spent(soul_token, inputs) => datum.sotoken == out_datum.sotoken
          or{
            and{
              datum.sotoken == out_datum.sotoken,
              datum.sotoken_limit == out_datum.sotoken_limit,
              datum.fee_claimer == out_datum.fee_claimer,
              datum.fee_claim_rule == out_datum.fee_claim_rule,
              datum.odao_fee == out_datum.odao_fee,
            },
            nft_spent(soul_token, ctx.transaction.inputs)?
          },
          or{
            and{
              datum.sotoken_amount == out_datum.sotoken_amount,
              datum.sotoken_backing == out_datum.sotoken_backing,
              datum.odao_sotoken == out_datum.odao_sotoken,
            },
            update_sotoken_amount(
              datum,
              out_datum,
              collateral_amo_id,
              controller_whitelist,
              tx_info.inputs,
              tx_info.mint,
              tx_info.extra_signatories,
              tx_info.datums,
              tx_info.redeemers,
              tx_info.reference_inputs
            ),
          },
          or{
            datum.odao_sotoken <= out_datum.odao_sotoken,
            and{
              nft_spent(out_datum.fee_claimer, tx_info.inputs)?,
              pairs.has_key(
                tx_info.withdrawals,
                Inline(ScriptCredential(datum.fee_claim_rule))
              )?
            }
          },
        }
      }
    }
  }
}
