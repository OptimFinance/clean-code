use aiken/transaction.{OutputReference}

use optim/types.{Nft, Id, ScriptHash}

pub type StakingAmoDatum {
  sotoken: ScriptHash,
  sotoken_amount: Int,
  sotoken_backing: Int,
  sotoken_limit: Int,
  odao_fee: Int,
  odao_sotoken: Int,
  fee_claimer: Nft
}

pub type CollateralAmoDatum {
  base_profit_uncommitted: Int,
  staking_amo: Id,
  child_strategies: List<Id>
}

pub type StrategyDatum {
  base_profit: Int,
  strategy_data: Data
}

pub type CollateralAmoRedeemer {
  UpdateStakingAmo
  SpawnStrategy(ScriptHash, OutputReference)
  DespawnStrategy(Id)
  SyncStrategy(Id)
  MergeStakingRate
  MergeNewDeposits
}
