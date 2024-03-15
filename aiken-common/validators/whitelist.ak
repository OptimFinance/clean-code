use aiken/hash.{Hash, Blake2b_224}
use aiken/transaction.{ScriptContext}

use optim/types.{
  Id,
  IdMintRedeemer,
}
use optim/utils.{
  mint_own_id,
  burn_own_id,
  nft_spent,
}

validator (soul_token: Id, tag: Int) {
  fn mint(redeemer: IdMintRedeemer, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    and{
      tag == tag,
      mint_own_id(
        redeemer,
        purpose,
        tx_info.inputs,
        tx_info.outputs,
        tx_info.mint,
        fn(_) { True }
      ),
      nft_spent(soul_token, tx_info.inputs)
    }
  }
  
  fn spend(_datum: Hash<Blake2b_224, Data>, _, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    and{
      burn_own_id(purpose, tx_info.inputs, tx_info.mint),
      nft_spent(soul_token, tx_info.inputs)
    }
  }
}
