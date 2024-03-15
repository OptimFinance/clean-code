use aiken/transaction/credential.{
  VerificationKey,
}

use optim/types.{Id, KeyHash, ScriptHash, Approval}

////////////////////////////////////////////////////////////////////////////////
// Account data

pub type AccountDatum {
  account_id: Id,
  owner: KeyHash,
  verification_key: VerificationKey,
  nonce: Int,
  intent_hash: ScriptHash
}

pub type AccountRedeemer {
  FundAccount
  SpendAccount
}

pub type AccountShardDatum {
  account_id: Id,
}

////////////////////////////////////////////////////////////////////////////////
// Approval data

pub type ApprovalDatum {
  owner: KeyHash,
  approved: Approval
}

pub type ApprovalRedeemer {
}

////////////////////////////////////////////////////////////////////////////////
// Approved approvals data

pub type ApprovedApprovalDatum {
  approved: Approval
}

pub type ApprovedApprovalRedeemer {
}
