# Avalanche Staking Chain L1

A custom Avalanche L1 blockchain with integrated staking and lending functionality. This system allows users to stake AVAX tokens, integrates with Aave lending pools for yield generation, and distributes rewards based on accrued interest.

## Features

- Custom Avalanche L1 blockchain with EVM compatibility
- Core staking contract with position tracking
- Flexible lock periods and minimum stake amounts
- Emergency unstaking with penalty mechanism
- Comprehensive access controls and security features

## Project Structure

```
├── contracts/
│   └── StakingContract.sol      # Core staking contract
├── test/
│   └── StakingContract.test.js  # Comprehensive unit tests
├── scripts/
│   └── deploy.js                # Deployment script
├── genesis.json                 # Genesis configuration for L1
├── avalanche-l1-config.json     # L1 blockchain configuration
└── hardhat.config.js            # Hardhat configuration
```

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Avalanche CLI (for L1 deployment)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Compile contracts:
```bash
npx hardhat compile
```

3. Run tests:
```bash
npx hardhat test
```

## L1 Blockchain Configuration

The custom L1 blockchain is configured with:
- **Chain ID**: 43112
- **Block Time**: 2 seconds
- **Gas Limit**: 15,000,000 per block
- **EVM Compatibility**: Full Ethereum compatibility
- **Optimized Parameters**: For staking operations

## Staking Contract Features

### Core Functionality
- **Stake AVAX**: Users can stake AVAX tokens with flexible lock periods
- **Position Tracking**: Each stake creates a unique position with ID
- **Lock Periods**: Configurable minimum and maximum lock periods
- **Unstaking**: Users can unstake after lock period expires
- **Emergency Unstaking**: Early unstaking with 10% penalty

### Security Features
- **ReentrancyGuard**: Protection against reentrancy attacks
- **Pausable**: Emergency pause functionality
- **Access Control**: Owner-only administrative functions
- **Input Validation**: Comprehensive parameter validation

### Data Structures

```solidity
struct StakingPosition {
    uint256 id;
    address staker;
    uint256 amount;
    uint256 startTime;
    uint256 lockPeriod;
    uint256 lastRewardClaim;
    bool active;
}
```

## Deployment

### Local Development

1. Start local Hardhat network:
```bash
npx hardhat node
```

2. Deploy contracts:
```bash
npx hardhat run scripts/deploy.js --network localhost
```

### Avalanche L1 Deployment

1. Configure Avalanche CLI with the provided genesis configuration
2. Deploy the L1 blockchain using `avalanche-l1-config.json`
3. Deploy contracts to the L1 network:
```bash
npx hardhat run scripts/deploy.js --network avalanche_l1
```


## Deployed Addresses

- Avalanche Fuji (43113)
  - RealAaveIntegration: 0x1AE62F9146C772d3224636425ADD287e12fc92e8
  - StakingContract: 0x4b02E32b57C65352d9bBA68a110E2F80B208aFec
  - RewardDistribution: 0x3b8044e6ECF1e4C5a529B194c1305b157a68e92B

- GitStake Subnet L1 (Chain ID 94582)
  - Local RPC: http://127.0.0.1:9650/ext/bc/MN8ag7XwC6v9UgwkffARz25cva9CVuiR7Aos9YJrN1E7re7aa/rpc
  - Example Public RPC (ngrok): https://YOUR-NGROK-SUBDOMAIN.ngrok-free.app/ext/bc/MN8ag7XwC6v9UgwkffARz25cva9CVuiR7Aos9YJrN1E7re7aa/rpc
  - Test ERC20 (Builder UI): 0x28b203cb3d9356573a9bac48556bdf6f522ef6fd

## Testing

The project includes comprehensive unit tests covering:
- Contract deployment and initialization
- Staking functionality with various scenarios
- Position management and tracking
- Unstaking with lock period validation
- Emergency unstaking with penalties
- Access control and security features
- Edge cases and error conditions

Run tests:
```bash
npx hardhat test
```

## Configuration Parameters

### Default Staking Parameters
- **Minimum Stake**: 1 AVAX
- **Minimum Lock Period**: 1 day (86,400 seconds)
- **Maximum Lock Period**: 1 year (31,536,000 seconds)
- **Emergency Unstake Penalty**: 10%

### L1 Blockchain Parameters
- **Block Time**: 2 seconds
- **Gas Limit**: 15,000,000
- **Base Fee**: 25 Gwei
- **Target Gas**: 15,000,000

## Next Steps

This implementation completes Task 1 of the Avalanche Staking Chain specification:
- ✅ Custom L1 blockchain configuration
- ✅ Core staking contract with position tracking
- ✅ Comprehensive unit tests
- ✅ Deployment scripts and documentation

The next tasks will involve:
- Aave integration for automated yield generation
- Reward distribution system
- End-to-end integration testing

## Security Considerations

- All contracts use OpenZeppelin security libraries
- Comprehensive input validation and error handling
- Emergency pause functionality for critical issues
- Access control for administrative functions
- Protection against common attack vectors (reentrancy, overflow, etc.)