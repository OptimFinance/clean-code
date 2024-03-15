use aiken/bytearray
use aiken/cbor.{serialise}
use aiken/dict
use aiken/hash.{Hash, Blake2b_224, blake2b_256}
use aiken/list
use aiken/transaction.{
  InlineDatum,
  Input,
  Mint,
  NoDatum,
  Output,
  OutputReference,
  TransactionId,
}
use aiken/transaction/credential.{
  Address,
  VerificationKeyCredential,
  ScriptCredential,
}
use aiken/transaction/value.{Value, AssetName}
use optim/types.{MintId, AssetClass}

use optim/utils.{
  const_,
  id,
  is_whitelisted,
  mint_own_id,
  find_id_input,
  find_id_output,
}

fn test_mint_own_id(
  transform_inputs: fn(List<Input>) -> List<Input>,
  transform_outputs: fn(List<Output>) -> List<Output>,
  transform_mint: fn(Value) -> Value,
  transform_asset_name: fn(AssetName) -> AssetName
) {
  let script_hash = "id_policy_script_hash"
  let out_ref = OutputReference(TransactionId("output_reference"), 0)
  let asset_name = blake2b_256(serialise(out_ref)) |> transform_asset_name
  let other_asset_name =
    bytearray.push(bytearray.drop(asset_name, 1), 0x00)
  let id_value = value.from_asset(script_hash, asset_name, 1)
  let other_id_value = value.from_asset(script_hash, other_asset_name, 1)
  let purpose = Mint(script_hash)
  let inputs = [
    Input(
      out_ref,
      Output(
        Address(VerificationKeyCredential("user_key"), None),
        value.from_lovelace(5_000_000),
        NoDatum,
        None
      )
    )
  ] |> transform_inputs
  let outputs = [
    Output(
      Address(ScriptCredential(script_hash), None),
      value.from_lovelace(2_000_000) |> value.merge(id_value),
      InlineDatum(Void),
      None
    ),
    Output(
      Address(ScriptCredential(script_hash), None),
      value.from_lovelace(2_000_000) |> value.merge(other_id_value),
      InlineDatum(Void),
      None
    ),
    // user output not really needed, but included anyway
    Output(
      Address(VerificationKeyCredential("user_key"), None),
      value.from_lovelace(2_700_000),
      InlineDatum(Void),
      None
    )
  ] |> transform_outputs
  let mint = 
    value.merge(id_value, other_id_value)
      |> transform_mint
      |> value.to_minted_value
  mint_own_id(
    MintId(out_ref),
    purpose,
    inputs,
    outputs,
    mint,
    const_(True),
  )
}

test mint_own_id_succeeds() {
  test_mint_own_id(id, id, id, id)
}

test mint_own_id_duplicate_fails() {
  !test_mint_own_id(id, id, fn(mint) { value.merge(mint, mint) }, id)
}

test mint_own_id_wrong_asset_name_fails() {
  !test_mint_own_id(id, id, id, const_("incorrect_asset_name"))
}

test mint_own_id_self_spend_fails() {
  let script_hash = "id_policy_script_hash"
  let out_ref = OutputReference(TransactionId("output_reference"), 0)
  let asset_name = blake2b_256(serialise(out_ref))
  let previous_id_value = value.from_asset(script_hash, "previously_minted", 1)
  let bad_id_value =
    value.from_asset(
      script_hash,
      bytearray.push(bytearray.drop(asset_name, 1), 0xff),
      1
    )
  let extra_id =
    Output(
      Address(ScriptCredential(script_hash), None),
      value.from_lovelace(2_000_000) |> value.merge(previous_id_value),
      InlineDatum(Void),
      None
    )
  !test_mint_own_id(
    list.push(
      _,
      Input(OutputReference(TransactionId("previous_transaction"), 0), extra_id)
    ),
    list.push(_, extra_id),
    value.merge(_, bad_id_value),
    id
  )
}

fn test_whitelist(
  transform_whitelist_value: fn(Value) -> Value,
  transform_whitelist_hash: fn(Hash<Blake2b_224, Data>) -> Hash<Blake2b_224, Data>,
  transform_reference_inputs: fn(List<Input>) -> List<Input>
) {
  let hash = "whitelisted_hash"
  let whitelist = "whitelist_script_hash"
  let reference_inputs = [
    Input(
      OutputReference(TransactionId("whitelist_out_ref_a"), 0),
      Output(
        Address(ScriptCredential(whitelist), None),
        value.from_asset(whitelist, "whitelist_asset_name", 1)
          |> value.merge(value.from_lovelace(2_000_000))
          |> transform_whitelist_value,
        InlineDatum("other_hash"),
        None
      )
    ),
    Input(
      OutputReference(TransactionId("unrelated_ref"), 0),
      Output(
        Address(ScriptCredential("unrelated_script"), None),
        value.from_lovelace(2_000_000),
        InlineDatum(Void),
        None
      )
    ),
    Input(
      OutputReference(TransactionId("whitelist_out_ref_b"), 0),
      Output(
        Address(ScriptCredential(whitelist), None),
        value.from_asset(whitelist, "whitelist_asset_name", 1)
          |> value.merge(value.from_lovelace(2_000_000))
          |> transform_whitelist_value,
        InlineDatum(transform_whitelist_hash(hash)),
        None
      )
    )
  ] |> transform_reference_inputs
  let datums = dict.new()
  is_whitelisted(
    hash,
    whitelist,
    reference_inputs,
    datums
  )
}

test whitelist_succeeds() {
  test_whitelist(id, id, id)
}

test whitelist_missing_token_fails() {
  !test_whitelist(const_(value.from_lovelace(2_000_000)), id, list.drop(_, 2))
}

test whitelist_incorrect_hash_fails() {
  !test_whitelist(id, const_("wrong_hash"), list.drop(_, 2))
}

test whitelist_no_reference_fails() {
  !test_whitelist(id, id, const_([]))
}

fn test_find_id_input(
  transform_input_value: fn(Value) -> Value,
  transform_asset_name: fn(ByteArray) -> ByteArray
) {
  let script_hash = "id_policy_script_hash"
  let asset_name = "id_asset_name"
  let inputs = [
    Input(
      OutputReference(TransactionId("id_input_out_ref"), 0),
      Output(
        Address(ScriptCredential(script_hash), None),
        value.from_asset(script_hash, asset_name |> transform_asset_name, 1)
          |> value.merge(value.from_lovelace(2_000_000))
          |> transform_input_value,
        InlineDatum(Void),
        None
      )
    )
  ]
  find_id_input(AssetClass(script_hash, asset_name), inputs) != None
}

test find_id_input_succeeds() {
  test_find_id_input(id, id)
}

test find_id_input_missing_fails() {
  !test_find_id_input(const_(value.from_lovelace(2_000_000)), id)
}

test find_id_input_wrong_asset_name_fails() {
  !test_find_id_input(id, const_("wrong_asset_name"))
}

fn test_find_id_output(
  transform_output_value: fn(Value) -> Value,
  transform_asset_name: fn(ByteArray) -> ByteArray
) {
  let script_hash = "id_policy_script_hash"
  let asset_name = "id_asset_name"
  let outputs = [
    Output(
      Address(ScriptCredential(script_hash), None),
      value.from_asset(script_hash, asset_name |> transform_asset_name, 1)
        |> value.merge(value.from_lovelace(2_000_000))
        |> transform_output_value,
      InlineDatum(Void),
      None
    )
  ]
  find_id_output(AssetClass(script_hash, asset_name), outputs) != None
}

test find_id_output_succeeds() {
  test_find_id_output(id, id)
}

test find_id_output_missing_fails() {
  !test_find_id_output(const_(value.from_lovelace(2_000_000)), id)
}

test find_id_output_wrong_asset_name_fails() {
  !test_find_id_output(id, const_("wrong_asset_name"))
}
