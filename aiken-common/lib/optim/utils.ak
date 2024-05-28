use aiken/builtin
use aiken/bytearray
use aiken/cbor.{serialise}
use aiken/dict
use aiken/hash.{Hash, Blake2b_224, blake2b_256}
use aiken/interval.{Finite}
use aiken/list
use aiken/option
use aiken/pairs
use aiken/transaction.{
  DatumHash,
  InlineDatum,
  Input,
  Mint,
  NoDatum,
  Output,
  Redeemer,
  ScriptPurpose,
  Spend,
  ValidityRange,
  find_script_outputs
}
use aiken/transaction/credential.{
  ScriptCredential,
}
use aiken/transaction/value.{MintedValue, PolicyId, Value}
use optim/types.{
  AssetClass,
  DataMap,
  Id,
  IdMintRedeemer,
  KeyHash,
  MintId,
  BurnId,
  ScriptHash,
}

pub fn id(x) { x }
pub fn const_(x) { fn(_) { x } }

pub fn get_output_datum(output: Output, datums: DataMap) -> Data {
  when output.datum is {
    InlineDatum(data) -> data
    DatumHash(datum_hash) -> {
      expect Some(data) = dict.get(datums, datum_hash)
      data
    }
    NoDatum -> error "Script output missing datum"
  }
}

pub fn value_has_policy(value: Value, policy_id: PolicyId) {
  list.any(
    dict.to_pairs(value.tokens(value, policy_id)),
    fn(token) { token.2nd > 0 }
  )
}

pub fn id_to_string(id: Id) -> String {
  bytearray.to_hex(bytearray.concat(id.policy_id, id.asset_name))
}

pub fn input_has_own_id(input: Input) {
  expect ScriptCredential(script_hash) = input.output.address.payment_credential
  value_has_policy(input.output.value, script_hash)
}

pub fn match_input_id(input: Input, script_hash: ScriptHash) {
  and{
    input.output.address.payment_credential == ScriptCredential(script_hash),
    input_has_own_id(input)
  }
}

pub fn nft_spent(nft: AssetClass, inputs: List<Input>) -> Bool {
  list.any(
    inputs,
    fn(input) {
      value.quantity_of(input.output.value, nft.policy_id, nft.asset_name) > 0
    }
  )
}

pub fn find_id_input(id: Id, inputs: List<Input>) -> Option<Input> {
  list.find(
    inputs,
    fn(input) {
      and{
        (input.output.address.payment_credential == ScriptCredential(id.policy_id))?,
        (value.quantity_of(input.output.value, id.policy_id, id.asset_name) > 0)?
      }
    }
  )
}

pub fn find_id_output(id: Id, outputs: List<Output>) -> Option<Output> {
  list.find(
    outputs,
    fn(output) {
      and{
        (output.address.payment_credential == ScriptCredential(id.policy_id))?,
        (value.quantity_of(output.value, id.policy_id, id.asset_name) > 0)?
      }
    }
  )
}

pub fn find_own_input(purpose: ScriptPurpose, inputs: List<Input>) {
  expect Spend(own_input_ref) = purpose
  list.find(inputs, fn (input) { input.output_reference == own_input_ref }) 
}

pub fn get_own_id(purpose: ScriptPurpose, inputs: List<Input>) -> Option<Id> {
  find_own_input(purpose, inputs)
    |> option.and_then(fn(own_input) {
      expect ScriptCredential(own_script_hash) =
        own_input.output.address.payment_credential
      value.tokens(own_input.output.value, own_script_hash)
        |> dict.keys
        |> list.head
        |> option.and_then(fn(own_token_name) {
          Some(AssetClass(own_script_hash, own_token_name))
        })
    })
}

// Passes if either all of this script's tokens are being burned, or each
// of our own outputs validates successfully
pub fn mint_own_id(
  redeemer: IdMintRedeemer,
  purpose: ScriptPurpose,
  inputs: List<Input>,
  outputs: List<Output>,
  mint: MintedValue,
  extra_validate: fn(Output) -> Bool
) -> Bool {
  expect Mint(own_policy_id) = purpose
  let own_outputs = find_script_outputs(outputs, own_policy_id)
  let own_mints = value.tokens(value.from_minted_value(mint), own_policy_id)
  
  let validate_output = fn(output: Output, token_name_tail: ByteArray) {
    expect [Pair(id_token_name, id_token_quantity)] =
      dict.to_pairs(value.tokens(output.value, own_policy_id))

    and{
      extra_validate(output),
      (bytearray.drop(id_token_name, 1) == token_name_tail)?,
      (id_token_quantity == 1)?
    }
  }

  when redeemer is {
    MintId{ out_ref } -> {
      let token_name_tail =
        out_ref
          |> serialise
          |> blake2b_256
          |> bytearray.drop(1)

      and{
        list.any(inputs, fn(input) { input.output_reference == out_ref })?,
        list.all(own_outputs, validate_output(_, token_name_tail)),
        (list.length(own_outputs) == dict.size(own_mints))?,
        list.all(dict.values(own_mints), fn(n) { n == 1 })?
      }
    }
    BurnId ->
      // just check that tokens are actually burned, defer to spend validator
      list.all(dict.values(own_mints), fn(n) { n == -1 })?
  }
}

pub fn burn_own_id(
  purpose: ScriptPurpose,
  inputs: List<Input>,
  mint: MintedValue
) -> Bool {
  expect Some(AssetClass(own_script_hash, own_token_name)) = get_own_id(purpose, inputs)
  value.quantity_of(
    value.from_minted_value(mint),
    own_script_hash,
    own_token_name
  ) == -1
}

// Force-checks that the provided input has a bytestring for its datum and
// matches the provided hash
pub fn input_has_hash(
  hash: Hash<Blake2b_224, Data>,
  input: Input,
  datums: DataMap
) {
  expect datum: Hash<Blake2b_224, Data> =
    get_output_datum(input.output, datums)
  datum == hash
}

pub fn is_whitelisted(
  hash: Hash<Blake2b_224, Data>,
  whitelist: ScriptHash,
  reference_inputs: List<Input>,
  datums: DataMap
) {
  list.any(
    reference_inputs,
    fn(ref_input) {
      let is_whitelist =
        ref_input.output.address.payment_credential
          == ScriptCredential(whitelist)
      
      and{
        is_whitelist?,
        input_has_hash(hash, ref_input, datums)?,
        input_has_own_id(ref_input)?
      }
    }
  )
}

pub fn has_whitelist_signature(
  whitelist: ScriptHash,
  reference_inputs: List<Input>,
  signatories: List<KeyHash>,
  datums: DataMap
) {
  list.any(signatories, is_whitelisted(_, whitelist, reference_inputs, datums))
}

pub fn value_increased(input: Input, output: Output) -> Bool {
  let value_diff = value.merge(output.value, value.negate(input.output.value))
  list.all(value.flatten(value_diff), fn(v) { v.3rd >= 0 })
}

pub fn find_id_redeemer(
  id: Id,
  wrapped: Bool,
  inputs: List<Input>,
  redeemers: Pairs<ScriptPurpose, Redeemer>
) -> Option<Data> {
  find_id_input(id, inputs)
    |> option.and_then(fn (id_input) {
       pairs.get_first(redeemers, Spend(id_input.output_reference))
    })
    |> option.and_then(fn (redeemer) {
      if (wrapped) {
        expect Some(unwrapped) = list.head(builtin.un_constr_data(redeemer).2nd)
        Some(unwrapped)
      } else {
        Some(redeemer)
      }
    })
}

pub fn get_id_redeemer(
  id: Id,
  wrapped: Bool,
  inputs: List<Input>,
  redeemers: Pairs<ScriptPurpose, Redeemer>
) -> Data {
  expect Some(id_input) = find_id_input(id, inputs)
  expect Some(redeemer) = pairs.get_first(redeemers, Spend(id_input.output_reference))
  if (wrapped) {
    expect Some(unwrapped) = list.head(builtin.un_constr_data(redeemer).2nd)
    unwrapped
  } else {
    redeemer
  }
}

const epoch_boundary = 1_647_899_091_000
const epoch_length = 432_000_000
pub fn validity_range_to_epoch(validity_range: ValidityRange) -> Int {
  expect Finite(start_slot) = validity_range.lower_bound.bound_type
  expect Finite(end_slot) = validity_range.upper_bound.bound_type
  let start_epoch = (start_slot - epoch_boundary) / epoch_length
  let end_epoch = (end_slot - epoch_boundary) / epoch_length
  expect start_epoch == end_epoch
  start_epoch
}

pub fn slots_to_epoch_end(validity_range: ValidityRange) -> Int {
  expect Finite(end_slot) = validity_range.upper_bound.bound_type
  epoch_length - ((end_slot - epoch_boundary) % epoch_length)
}

pub fn require_delete(self: List<a>, elem: a) -> List<a> {
  when self is {
    [] -> error "require_delete: Element not in list"
    [x, ..xs] if x == elem -> xs
    [x, ..xs] -> list.push(require_delete(xs, elem), x)
  }
}
