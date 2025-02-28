use aiken/bytearray
use aiken/cbor
use aiken/dict
use aiken/hash.{blake2b_256}
use aiken/list
use aiken/math/rational
use aiken/option
use aiken/pairs
use aiken/transaction.{
  Mint,
  Output,
  ScriptContext,
  Spend,
  Input,
  InlineDatum,
  NoDatum,
  OutputReference,
  TransactionId,
  Transaction
}
use aiken/transaction/credential.{Address, Credential, ScriptCredential, VerificationKeyCredential}
use aiken/transaction/value

use optim/types.{IdMintRedeemer, KeyHash, Id, MintId, AssetClass, ScriptHash}
use optim/utils.{find_id_input, get_output_datum, mint_own_id}
use optim/types/oada.{StakingAmoDatum}

pub type WrappedRedeemer<data> {
  InvalidWrapped
  WrappedRedeemer{
    data: data
  }
}

type BatchStakeDatum {
  owner: KeyHash,
  return_address: Address
}

type DonationDatum {
  owner: KeyHash,
  donation_ratio: (Int, Int),
  initial_exchange: (Int, Int)
}

type Cip68Metadata = Pairs<ByteArray, Data>

type Cip68Datum<extra> {
  metadata: Cip68Metadata,
  version: Int,
  extra: extra
}

validator(donation_target: KeyHash, staking_amo: Id, batch_stake: ScriptHash) {
  fn mint(redeemer: IdMintRedeemer, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    
    expect Some(staking_amo_reference) = find_id_input(staking_amo, tx_info.reference_inputs)
    expect staking_amo_datum: StakingAmoDatum = get_output_datum(staking_amo_reference.output, tx_info.datums)

    mint_own_id(
      redeemer,
      purpose,
      tx_info.inputs,
      tx_info.outputs,
      tx_info.mint,
      fn (output: Output) {
        expect datum: DonationDatum = get_output_datum(output, tx_info.datums)
        expect Some(donation_ratio) = rational.new(datum.donation_ratio.1st, datum.donation_ratio.2nd)

        and{
          list.has(tx_info.extra_signatories, datum.owner)?,
          (rational.compare(rational.from_int(0), donation_ratio) == Less)?,
          (rational.compare(rational.from_int(1), donation_ratio) == Greater)?,
          (datum.initial_exchange == (staking_amo_datum.sotoken_backing, staking_amo_datum.sotoken_amount))?,
          (value.quantity_of(output.value, staking_amo_datum.sotoken, "") > 0)?
        }
      }
    )
  }

  fn spend(datum: DonationDatum, redeemer: (Int, Int, Int), ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx
    expect Spend(self_out_ref) = purpose
    expect Some(self_in) = list.find(tx_info.inputs, fn(input) { input.output_reference == self_out_ref })

    expect Some(staking_amo_reference) = find_id_input(staking_amo, tx_info.reference_inputs)
    expect staking_amo_datum: StakingAmoDatum = get_output_datum(staking_amo_reference.output, tx_info.datums)

    expect Some(current_exchange) = rational.new(staking_amo_datum.sotoken_backing, staking_amo_datum.sotoken_amount)
    expect Some(initial_exchange) = rational.new(datum.initial_exchange.1st, datum.initial_exchange.2nd)

    let self_sotoken = value.quantity_of(self_in.output.value, staking_amo_datum.sotoken, "")
    expect Some(burn_fee) = rational.new(999, 1000)
    let sotoken = rational.mul(rational.from_int(self_sotoken), burn_fee)
    let otoken_yield =
      rational.sub(current_exchange, initial_exchange) |> rational.mul(sotoken)
    expect Some(donation_ratio) = rational.new(datum.donation_ratio.1st, datum.donation_ratio.2nd)
    expect Some(to_donate) =
      otoken_yield
        |> rational.mul(donation_ratio)
        |> rational.div(_, current_exchange)
        |> option.map(rational.truncate)

    expect Some(donation_unstake_output) = list.at(tx_info.outputs, redeemer.1st)
    expect Some(change_unstake_output) = list.at(tx_info.outputs, redeemer.2nd)

    let validate_unstake_output = fn(recipient: KeyHash, amount: Int, output: Output) {
      expect unstake_datum: BatchStakeDatum = get_output_datum(output, tx_info.datums)
      and{
        (output.address.payment_credential == ScriptCredential(batch_stake))?,
        (value.quantity_of(output.value, staking_amo_datum.sotoken, "") == amount)?,
        (unstake_datum.owner == recipient)?,
        (unstake_datum.return_address.payment_credential == VerificationKeyCredential(recipient))?
      }
    }

    and{
      (to_donate == redeemer.3rd)?,
      list.has(tx_info.extra_signatories, datum.owner)?,
      validate_unstake_output(donation_target, to_donate, donation_unstake_output),
      validate_unstake_output(datum.owner, rational.truncate(sotoken) - to_donate, change_unstake_output)
    }
  }
}

validator(
  donation_script: ScriptHash,
  reference_holder: Credential,
  nft_name: Data,
  nft_description: Data,
  nft_image_url: Data
) {
  fn mint_nft(_redeemer: Data, ctx: ScriptContext) {
    let ScriptContext(tx_info, purpose) = ctx 
    expect Mint(policy_id) = purpose

    let own_tokens = dict.to_pairs(value.tokens(value.from_minted_value(tx_info.mint), policy_id))
    
    expect [donation_input] = list.filter(
      tx_info.inputs,
      fn(input) { input.output.address.payment_credential == ScriptCredential(donation_script) }
    )
    let token_name =
      cbor.serialise(donation_input.output_reference) |> blake2b_256 |> bytearray.drop(4)
    let donated: Int = {
      expect Some(data) = pairs.get_first(tx_info.redeemers, Spend(donation_input.output_reference))
      expect WrappedRedeemer(redeemer): WrappedRedeemer<(Int, Int, Int)> = data
      redeemer.3rd
    }

    let reference_token_name = bytearray.concat(#"000643b0", token_name)
    let user_token_name = bytearray.concat(#"000de140", token_name)

    expect Some(reference_token_output) = list.find(
      tx_info.outputs,
      fn(output) { value.quantity_of(output.value, policy_id, reference_token_name) == 1 }
    )

    expect reference_token_datum: Cip68Datum<Int> = get_output_datum(reference_token_output, tx_info.datums)

    let expected_reference_datum = Cip68Datum{
      metadata: [
        Pair("description", nft_description),
        Pair("image", nft_image_url),
        Pair("name", nft_name),
      ],
      version: 1,
      extra: donated
    }

    let reference_token_locked = reference_token_output.address.payment_credential == reference_holder

    and{
      (own_tokens == [Pair(reference_token_name, 1), Pair(user_token_name, 1)])?,
      (reference_token_datum == expected_reference_datum)?,
      reference_token_locked?
    }
  }
}

fn test_donation(
  transform_mint_transaction: fn(Transaction) -> Transaction,
  transform_donate_transaction: fn(Transaction) -> Transaction,
  include_nft: Bool
) -> Bool {
  let staking_amo_id: Id = AssetClass {
    policy_id: "staking_amo_policy_id",
    asset_name: "staking_amo_token_name"
  }
  let sotoken_amount = 8_000_000_000_001
  let sotoken_backing_0 = 9_000_000_000_001
  let sotoken_backing_1 = 9_500_000_000_001

  let initial_staking_amo_datum = StakingAmoDatum{
    sotoken: "sotoken_policy_id",
    sotoken_amount: sotoken_amount,
    sotoken_backing: sotoken_backing_0,
    sotoken_limit: 10_000_000_000_000,
    odao_fee: 0,
    odao_sotoken: 0,
    fee_claimer: AssetClass("fee_claimer_policy_id", ""),
    fee_claim_rule: "fee_claimer_script"
  }

  let staking_amo_input_0 = Input {
    output_reference: OutputReference(TransactionId("staking_amo_tx_id"), 0),
    output: Output {
      address: Address{ payment_credential: ScriptCredential(staking_amo_id.policy_id), stake_credential: None },
      value: value.from_asset(staking_amo_id.policy_id, staking_amo_id.asset_name, 1),
      datum: InlineDatum(initial_staking_amo_datum),
      reference_script: None
    }
  }

  let staking_amo_input_1 = Input {
    ..staking_amo_input_0,
    output: Output {
      ..staking_amo_input_0.output ,
      datum: InlineDatum(StakingAmoDatum{
        ..initial_staking_amo_datum,
        sotoken_amount: sotoken_amount,
        sotoken_backing: sotoken_backing_1
      })
    }
  }

  let token_seed_input = Input {
    output_reference: OutputReference(TransactionId("seed_tx_id"), 0),
    output: Output {
      address: Address{ payment_credential: VerificationKeyCredential("user_key_hash"), stake_credential: None },
      value: value.zero(),
      datum: NoDatum,
      reference_script: None
    }
  }

  let donation_target = "donation_target_key_hash"
  let batch_stake = "batch_stake_script_hash"

  let minted_id = value.from_asset(
    "donate_soda_script_hash",
    token_seed_input.output_reference |> cbor.serialise |> blake2b_256,
    1
  )

  let donation_datum = DonationDatum{
    owner: "donation_owner",
    donation_ratio: (3,4),
    initial_exchange: (sotoken_backing_0, sotoken_amount),
  }

  let locked_sotoken = 1_000_000
  let unburned_sotoken = locked_sotoken * 999 / 1000
  // doing this calculation inline just to avoid duplicating the validator code
  // as a sanity check
  let donated_sotoken =
    unburned_sotoken
      * (sotoken_backing_1 - sotoken_backing_0)
      * sotoken_amount
      * donation_datum.donation_ratio.1st
      / sotoken_backing_1
      / donation_datum.donation_ratio.2nd
      / sotoken_amount

  let donation_output = Output {
    address: Address{ payment_credential: ScriptCredential("donate_soda_script_hash"), stake_credential: None },
    value: minted_id |> value.merge(value.from_asset("sotoken_policy_id", "", locked_sotoken)),
    datum: InlineDatum(donation_datum),
    reference_script: None
  }

  let donation_output_ref = OutputReference(TransactionId("donation_tx_id"), 0)

  let token_name = donation_output_ref |> cbor.serialise |> blake2b_256 |> bytearray.drop(4)
  let reference_token_name = bytearray.concat(#"000643b0", token_name)
  let user_token_name = bytearray.concat(#"000de140", token_name)
  let minted_reference_nft = value.from_asset("donation_nft_script_hash", reference_token_name, 1)
  let minted_user_nft = value.from_asset("donation_nft_script_hash", user_token_name, 1)

  let reference_holder = ScriptCredential("always_fail_script_hash")
  let nft_name: Data = "sOADA Yield Donation NFT"
  let nft_description: Data = "Proof of your donation"
  let nft_image_url: Data = "https://example.com/image.jpg"

  let donate_redeemer_wrapped: Data = WrappedRedeemer((0, 1, donated_sotoken))

  let donate_transaction = Transaction {
    ..transaction.placeholder(),
    reference_inputs: [staking_amo_input_1],
    inputs: [
      Input{
        output_reference: donation_output_ref,
        output: donation_output
      }
    ],
    outputs: [
      Output{
        address: Address{ payment_credential: ScriptCredential(batch_stake), stake_credential: None },
        value: value.from_asset("sotoken_policy_id", "", donated_sotoken),
        datum: InlineDatum(BatchStakeDatum {
          owner: donation_target,
          return_address: Address{ payment_credential: VerificationKeyCredential(donation_target), stake_credential: None }
        }),
        reference_script: None
      },
      Output{
        address: Address{ payment_credential: ScriptCredential(batch_stake), stake_credential: None },
        value: value.from_asset("sotoken_policy_id", "", unburned_sotoken - donated_sotoken),
        datum: InlineDatum(BatchStakeDatum {
          owner: donation_datum.owner,
          return_address: Address{ payment_credential: VerificationKeyCredential(donation_datum.owner), stake_credential: None }
        }),
        reference_script: None
      },
      Output{
        address: Address{ payment_credential: reference_holder, stake_credential: None },
        value: minted_reference_nft,
        datum: InlineDatum(Cip68Datum{
          metadata: [
            Pair("description", nft_description),
            Pair("image", nft_image_url),
            Pair("name", nft_name)
          ],
          version: 1,
          extra: donated_sotoken,
        }),
        reference_script: None,
      }
    ] |> fn(outputs) { if !include_nft { list.take(outputs, 2) } else { outputs } },
    mint: if !include_nft { value.zero() } else { minted_reference_nft |> value.merge(minted_user_nft) } |> value.to_minted_value,
    extra_signatories: [donation_datum.owner],
    redeemers: [Pair(Spend(donation_output_ref), donate_redeemer_wrapped)]
  } |> transform_donate_transaction

  expect actual_donation_datum: DonationDatum =
    list.at(donate_transaction.inputs, 0)
      |> option.map(fn(input: Input) {
        expect InlineDatum(datum) = input.output.datum
        datum
      }) |> option.or_else(donation_datum)
  let donate_redeemer: (Int, Int, Int) = {
    expect Some(data) = pairs.get_first(donate_transaction.redeemers, Spend(donation_output_ref))
    expect WrappedRedeemer(redeemer): WrappedRedeemer<(Int, Int, Int)> = data
    redeemer
  }
      
  and{
    mint(
      donation_target,
      staking_amo_id,
      batch_stake,
      MintId(token_seed_input.output_reference),
      ScriptContext(
        Transaction {
          ..transaction.placeholder(),
          reference_inputs: [staking_amo_input_0],
          inputs: [token_seed_input],
          mint: minted_id |> value.to_minted_value,
          outputs: [donation_output],
          extra_signatories: [donation_datum.owner]
        } |> transform_mint_transaction,
        Mint("donate_soda_script_hash")
      )
    ),
    spend(
      donation_target,
      staking_amo_id,
      batch_stake,
      actual_donation_datum,
      donate_redeemer,
      ScriptContext(donate_transaction, Spend(donation_output_ref))
    ),
    if !include_nft { True } else {
      mint_nft(
        "donate_soda_script_hash",
        reference_holder,
        nft_name,
        nft_description,
        nft_image_url,
        Void,
        ScriptContext(donate_transaction, Mint("donation_nft_script_hash"))
      )
    }
  }
}

fn transform_reference_nft_datum(transform: fn(Cip68Datum<Int>) -> Cip68Datum<Int>) -> fn(Transaction) -> Transaction {
  fn(t: Transaction) {
    expect Some(reference_nft_output) = list.at(t.outputs, 2)
    expect reference_nft_datum: Cip68Datum<Int> = {
      expect InlineDatum(datum) = reference_nft_output.datum
      datum
    }
    Transaction{
      ..t,
      outputs:
        list.take(t.outputs, 2) |> list.concat(_, [
          Output{
            ..reference_nft_output,
            datum: InlineDatum(transform(reference_nft_datum))
          }
        ])
    }
  }
}

fn transform_batch_stake_datum(output_index: Int, transform: fn(BatchStakeDatum) -> BatchStakeDatum) -> fn(Transaction) -> Transaction {
  fn(t: Transaction) {
    expect Some(batch_stake_output) = list.at(t.outputs, output_index)
    expect batch_stake_datum: BatchStakeDatum = {
      expect InlineDatum(datum) = batch_stake_output.datum
      datum
    }
    Transaction{
      ..t,
      outputs:
        list.take(t.outputs, output_index) |> list.concat(_, [
          Output{
            ..batch_stake_output,
            datum: InlineDatum(transform(batch_stake_datum))
          }
        ]) |> list.concat(list.slice(t.outputs, output_index + 1, -1))
    }
  }
}

test test_donate() {
  test_donation(fn(t) {t}, fn(t) {t}, True)
}

// negative tests below heavily depend on knowledge of the structure and
// assumptions of `test_donation`
!test test_donate_missing_donation_output_fails() {
  test_donation(fn(t) {t}, fn(t) { Transaction{..t, outputs: list.drop(t.outputs, 1) } }, True)
}

!test test_donate_incorrect_donation_report_fails() {
  let donate_redeemer = (0, 1, 9999999999)
  let donate_redeemer_wrapped: Data = WrappedRedeemer(donate_redeemer)
  test_donation(fn(t) {t}, fn(t) {
    expect [donation_input] = t.inputs
    Transaction{
      ..t,
      redeemers: [Pair(Spend(donation_input.output_reference), donate_redeemer_wrapped)]
    } |> transform_reference_nft_datum(fn(datum) {
      Cip68Datum{ ..datum, extra: 9999999999 }
    })
  }, True)
}

!test test_donate_incorrect_donation_ratio_fails() {
  test_donation(
    fn(t) {t},
    fn(t) {
      expect [donation_input] = t.inputs
      expect donation_datum: DonationDatum = {
        expect InlineDatum(datum) = donation_input.output.datum
        datum
      }
      Transaction{
        ..t,
        inputs: [
          Input{
            ..donation_input,
            output: Output{
              ..donation_input.output,
              datum: InlineDatum(DonationDatum{
                ..donation_datum,
                donation_ratio: (1, 10)
              })
            }
          }
        ]
      }
    },
    True
  )
}

!test test_donate_missing_change_output_fails() {
  test_donation(
    fn(t) {t},
    fn(t) { Transaction{..t, outputs: list.take(t.outputs, 1) |> list.concat(list.drop(t.outputs, 2)) } },
    True
  )
}

!test test_donate_wrong_output_order_fails() {
  test_donation(
    fn(t) {t},
    fn(t) {
      Transaction{
        ..t,
        outputs: list.take(t.outputs, 2) |> list.reverse
      }
    },
    True
  )
}

!test test_donate_missing_reference_nft_output_fails() {
  test_donation(
    fn(t) {t},
    fn(t) { Transaction{..t, outputs: list.take(t.outputs, 2) } },
    True
  )
}

!test test_donate_bad_batch_stake_owner() {
  or{
    test_donation(
      fn(t) {t},
      transform_batch_stake_datum(0, fn(datum) {
        BatchStakeDatum{ ..datum, owner: "bad_owner_key_hash" }
      }),
      True
    ),
    test_donation(
      fn(t) {t},
      transform_batch_stake_datum(1, fn(datum) {
        BatchStakeDatum{ ..datum, owner: "bad_owner_key_hash" }
      }),
      True
    ),
  }
}

!test test_donate_bad_reference_nft_datum_fails() {
  or{
    test_donation(
      fn(t) {t},
      transform_reference_nft_datum(fn(datum) {
        Cip68Datum{ ..datum, extra: 100000000 }
      }),
      True
    ),
    test_donation(
      fn(t) {t},
      transform_reference_nft_datum(fn(datum) {
        Cip68Datum{
          ..datum,
          metadata: pairs.foldr(
            datum.metadata,
            [],
            fn(key, value, acc) {
              if key == "name" {
                let new_name: Data = "Incorrect metadata name"
                list.push(acc, Pair("name", new_name))
              } else {
                list.push(acc, Pair(key, value))
              }
            }
          )
        }
      }),
      True
    ),
    test_donation(
      fn(t) {t},
      transform_reference_nft_datum(fn(datum) {
        Cip68Datum{
          ..datum,
          metadata: pairs.foldr(
            datum.metadata,
            [],
            fn(key, value, acc) {
              if key == "name" {
                acc
              } else {
                list.push(acc, Pair(key, value))
              }
            }
          )
        }
      }),
      True
    ),
  }
}

!test test_donation_nft_double_satisfaction_fails() {
  test_donation(
    fn(t) {t},
    fn(t) { Transaction{..t, inputs: list.concat(t.inputs, t.inputs) } },
    True // double satisfaction will succeed if we don't mint the NFT, but the donator has nothing to gain from doing this
  )
}
