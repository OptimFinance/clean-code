# OADA UNHCR Yield Donation Module

A decentralized donation protocol built on Cardano using Aiken smart contracts. OADA enables automated charitable giving through staking mechanisms and yield distribution.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Contract Structure](#contract-structure)
- [Getting Started](#getting-started)
- [Testing](#testing)
- [Contributing](#contributing)

## 🎯 Overview

OADA is a sophisticated DeFi protocol that combines staking, yield generation, and automated charitable donations. The protocol allows users to stake tokens and automatically donate a portion of their yield to charitable causes while maintaining control over their funds.

### Key Features

- **Automated Donations**: Configurable donation ratios for yield distribution
- **Staking Mechanics**: sOTOKEN and OTOKEN exchange mechanisms
- **Yield Management**: Automated yield calculation and distribution
- **NFT Rewards**: CIP-68 compliant NFTs for donation tracking
- **Batch Processing**: Efficient batch staking operations

## 🏗️ Architecture

The OADA protocol consists of several interconnected smart contracts that work together to provide a complete donation and staking ecosystem:

```
OADA Protocol
├── Core Contracts
│   ├── Staking AMO (Automated Market Operations)
│   ├── Donation Validator
│   ├── Batch Stake Validator
│   └── Collateral AMO
├── Supporting Contracts
│   ├── Token Policies (OTOKEN, sOTOKEN)
│   ├── Fee Claim Rules
│   └── Donation Strategies
└── Utilities
    ├── Validation Functions
    └── Common Types
```

## 📜 Contract Structure

### Core Validators

#### 1. `donate_soada.ak` - Main Donation Validator

**Purpose**: Handles the core donation logic and NFT minting

**Key Functions**:

- `mint(redeemer: IdMintRedeemer, ctx: ScriptContext)`: Mints donation positions
- `spend(datum: DonationDatum, redeemer: (Int, Int, Int), ctx: ScriptContext)`: Processes donations

**Datum Structure**:

```aiken
type DonationDatum {
  owner: KeyHash,
  donation_ratio: (Int, Int),  // Ratio as (numerator, denominator)
  initial_exchange: (Int, Int) // Initial exchange rate
}
```

#### 2. `staking_amo.ak` - Staking Automated Market Operations

**Purpose**: Manages sOTOKEN supply and exchange rates

**Key Functions**:

- `mint(redeemer: IdMintRedeemer, ctx: ScriptContext)`: Mints staking positions
- `spend(datum: StakingAmoDatum, _redeemer: Data, ctx: ScriptContext)`: Updates staking parameters

**Datum Structure**:

```aiken
type StakingAmoDatum {
  sotoken: PolicyId,
  sotoken_amount: Int,
  sotoken_backing: Int,
  sotoken_limit: Int,
  odao_fee: Int,
  fee_claimer: Id,
  fee_claim_rule: ScriptHash,
  odao_sotoken: Int
}
```

#### 3. `batch_stake.ak` - Batch Staking Validator

**Purpose**: Handles batch staking and unstaking operations

**Key Functions**:

- `spend(datum: BatchStakeDatum, redeemer: BatchStakeRedeemer, ctx: ScriptContext)`: Processes batch operations

**Redeemer Types**:

```aiken
type BatchStakeRedeemer {
  CancelStake
  DigestStake(Int, Option<Int>)
}
```

#### 4. `collateral_amo.ak` - Collateral Management

**Purpose**: Manages collateral and strategy deployment

#### 5. `deposit_amo.ak` - Deposit Management

**Purpose**: Handles deposit operations and liquidity management

### Supporting Contracts

#### Token Policies

- `otoken_policy.ak`: OTOKEN minting policy
- `sotoken_rule.ak`: sOTOKEN validation rules
- `otoken_rule.ak`: OTOKEN validation rules

#### Fee Management

- `fee_claim_rule.ak`: Fee claiming logic
- `donation_strategy.ak`: Donation strategy management

### Utility Modules

#### `validation.ak` - Core Validation Functions

Key functions for contract validation:

- `update_sotoken_amount/11`: Updates sOTOKEN amounts and exchange rates
- `spawn_strategy/11`: Deploys new strategies
- `despawn_strategy/9`: Destroys strategies and returns funds

## 🚀 Getting Started

### Prerequisites

- [Aiken](https://aiken-lang.org/) compiler (v1.9.0+)
- [Nix](https://nixos.org/) package manager
- Cardano development environment

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/OptimFinance/clean-code.git
   cd yield-donation
   ```

2. **Setup development environment**:

   ```bash
   nix develop
   ```

3. **Install dependencies**:
   ```bash
   cd oada
   aiken check
   ```

### Project Structure

```
oada-donate/
├── oada/                 # Main Aiken project
│   ├── validators/       # Smart contract validators
│   ├── lib/              # Library modules
│   ├── aiken.toml        # Project configuration
│   └── plutus.json       # Plutus compatibility layer
├── aiken-common/         # Shared Aiken utilities
├── test/                 # Test suite
├── flake.nix             # Nix development environment
├── README.md             # This file
├── DEVELOPER_GUIDELINES.md # Developer guidelines
└── LICENSE.md            # MIT License
```

## 👨‍💻 Development Guidelines

For comprehensive development guidelines, code style, testing practices, and contribution workflows, please see [DEVELOPER_GUIDELINES.md](DEVELOPER_GUIDELINES.md).

## 🧪 Testing

### Quick Start

```bash
cd oada
aiken test
```

For comprehensive testing guidelines, best practices, and advanced testing techniques, see [DEVELOPER_GUIDELINES.md](DEVELOPER_GUIDELINES.md#testing-guidelines).

## 🤝 Contributing

We welcome contributions! Please see [DEVELOPER_GUIDELINES.md](DEVELOPER_GUIDELINES.md#contributing) for detailed information about:

- Development workflow
- Pull request guidelines
- Code review process
- Commit message conventions
- Code review checklist

## 📚 Additional Resources

- [Aiken Documentation](https://aiken-lang.org/)
- [Cardano Developer Portal](https://developers.cardano.org/)
- [Plutus Documentation](https://plutus.readthedocs.io/)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/optim/oada-donate/issues)
- **Discussions**: [GitHub Discussions](https://github.com/optim/oada-donate/discussions)
- **Documentation**: [Project Wiki](https://github.com/optim/oada-donate/wiki)

---

**Note**: This is a development version. For production use, ensure thorough testing and security audits.
