use aiken/transaction.{
  ScriptContext,
}

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
  update_odao_sotoken
}

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
        and{
          (datum != out_datum)?,
          or{
            and{
              datum.sotoken == out_datum.sotoken,
              datum.sotoken_limit == out_datum.sotoken_limit,
              datum.fee_claimer == out_datum.fee_claimer,
              datum.odao_fee == out_datum.odao_fee,
            },
            nft_spent(soul_token, ctx.transaction.inputs)?
          },
          or{
            and{
              datum.sotoken_amount == out_datum.sotoken_amount,
              datum.sotoken_backing == out_datum.sotoken_backing,
              datum.odao_sotoken >= out_datum.odao_sotoken,
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
            update_odao_sotoken(
              out_datum,
              tx_info.inputs,
            )
          },
        }
      }
    }
  }
}
