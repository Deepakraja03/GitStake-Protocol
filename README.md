# GitStake Protocol

A decentralized staking and prize distribution protocol built on Avalanche Fuji testnet. The protocol allows users to stake AVAX, earn yield through Aave v3 integration, and win prizes based on staking performance and random selection.

## Features

- **Epoch-based Staking**: Fixed-duration staking periods with automatic yield generation
- **Aave v3 Integration**: Native AVAX deposits/withdrawals through WAVAX gateway
- **Prize Distribution**: Top stakers win prizes based on exponential rank weighting
- **Decentralized**: No admin control over prize distribution after deployment
- **Gas Efficient**: Optimized for minimal transaction costs
- **Secure**: Built with OpenZeppelin libraries and comprehensive testing

## Project Structure

```
├── contracts/
│   ├── EpochPrizePool.sol       # Core prize pool contract
│   ├── RealAaveIntegration.sol  # Aave v3 integration
│   └── interfaces/              # Contract interfaces
├── test/
│   ├── EpochPrizePool.test.js   # Unit tests
│   └── integration/             # Integration tests
├── scripts/
│   ├── integration_epoch_prize_pool.js  # Main integration script
│   ├── check_current_aave.js    # Check current Aave integration
│   └── switch_to_real_aave.js   # Switch to RealAaveIntegration
├── .env.example                # Environment variables template
├── hardhat.config.js           # Hardhat configuration
└── CONTRACT_REFERENCE.md       # Detailed contract documentation
```

## Quick Start

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Hardhat
- Fuji testnet AVAX (from [faucet](https://faucet.avax.network/))

### Installation

1. Clone the repository and install dependencies:
```bash
git clone <repository-url>
cd GitStakeProtocol-Contract
npm install
```

2. Copy `.env.example` to `.env` and update with your configuration:
```bash
cp .env.example .env
# Edit .env with your private key and contract addresses
```

3. Compile contracts:
```bash
npx hardhat compile
```

## Usage

### Running the Integration Test

1. Make sure you have configured your `.env` file with:
   - `PRIVATE_KEY` - Your wallet private key
   - `FUJI_RPC_URL` - Fuji testnet RPC URL
   - `WINNER_SIGNER_PK` - Private key for signing winners (can be same as PRIVATE_KEY)
   - `WINNERS_CSV` - Comma-separated list of winner addresses (optional)

2. Run the integration script:
```bash
npx hardhat run scripts/integration_epoch_prize_pool.js --network fuji
```

### Checking Current Aave Integration

To verify which Aave integration is currently configured:
```bash
npx hardhat run scripts/check_current_aave.js --network fuji
```

### Switching to RealAaveIntegration

If needed, switch the pool to use the RealAaveIntegration:
```bash
npx hardhat run scripts/switch_to_real_aave.js --network fuji
```

## Contract Documentation

For detailed documentation on contract functions, parameters, and integration flow, see:

- [CONTRACT_REFERENCE.md](./CONTRACT_REFERENCE.md) - Comprehensive contract reference
- [DEPLOYMENTS.md](./DEPLOYMENTS.md) - Deployed contract addresses
- [INTEGRATION_VERIFICATION.md](./INTEGRATION_VERIFICATION.md) - Integration verification status

## Development

### Testing

Run the test suite:
```bash
npx hardhat test
```

### Deploying

1. Update `scripts/deploy.js` if needed
2. Run the deployment script:
```bash
npx hardhat run scripts/deploy.js --network fuji
```

## Security

- Contracts are non-upgradeable for maximum transparency
- All external calls use checks-effects-interactions pattern
- Reentrancy protection on all state-changing functions
- Comprehensive test coverage

## License

MIT
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

### Latest Deployment - Avalanche Fuji (43113) - Updated with bgd-labs/aave-address-book
  - RealAaveIntegration: 0xe9782b8942D563210C7a36F2B309939A8ae08509
  - StakingContract: 0xDedd1411952ec1FE6d8102fabC98DD8982B8196d
  - RewardDistribution: 0xa76C8826bf40632836cC00A23dEdF02dd920DadF
  - EpochPrizePool: 0xbE7BC82d2E16b3d139C96A26a8Ac3d61ce290694
  - MockAaveIntegration: 0x97237cF4B21B185Aa181fc69249B5B49630ab74c

### Previous Deployment - Avalanche Fuji (43113)
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