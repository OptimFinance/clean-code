use aiken/dict.{Dict}
use aiken/hash.{Blake2b_224, Blake2b_256, Hash}
use aiken/transaction.{OutputReference}
use aiken/transaction/credential.{
  Script,
  Signature,
  PaymentCredential,
  VerificationKey,
}
use aiken/transaction/value.{AssetName, PolicyId, Value}

////////////////////////////////////////////////////////////////////////////////
// Plutus helper types

pub type ScriptHash = Hash<Blake2b_224, Script>
pub type KeyHash = Hash<Blake2b_224, VerificationKey>
pub type DataHash = Hash<Blake2b_256, Data>
pub type DataMap = Dict<DataHash, Data>

////////////////////////////////////////////////////////////////////////////////
// High-level application types

pub type AssetClass {
  policy_id: PolicyId,
  asset_name: AssetName
}
pub type Id = AssetClass
pub type Nft = AssetClass

pub type Intent {
  account_id: Id,
  app_id: Id,
  signature: Signature,
  header: String,
  nonce: Int,
  fee: Int,
  payload: String
}

pub type VirtualAddress {
  AccountAddress{ id: Id }
  IdAddress{ id: Id }
  RawAddress{ credential: PaymentCredential }
  ZeroAddress
}

pub type Approval {
  ApprovedPolicy{ id: PolicyId }
  ApprovedId{ id: Id }
  ApprovedIntentAnnouncer{ script: ScriptHash }
}

pub type Action {
  MoveTokens {
    app_id: Id,
    tokens: Value,
    sender: VirtualAddress,
    recipient: VirtualAddress
  }
}

pub type IntentActionsRedeemer {
  intents: List<Intent>,
  actions: List<Action>
}

pub type IdMintRedeemer {
  MintId{ out_ref: OutputReference }
  BurnId
}
