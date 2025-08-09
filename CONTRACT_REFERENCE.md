# GitStake Protocol - Contract Reference

## Table of Contents
- [Core Contracts](#core-contracts)
- [EpochPrizePool](#epochprizepool)
- [RealAaveIntegration](#realaaveintegration)
- [Integration Flow](#integration-flow)
- [Helper Scripts](#helper-scripts)

## Core Contracts

### EpochPrizePool
Manages staking epochs, winner selection, and prize distribution.

### RealAaveIntegration
Handles deposits/withdrawals to Aave v3, using WAVAX gateway for native AVAX support.

## EpochPrizePool

### Key Functions

#### deposit()
```solidity
function deposit() external payable nonReentrant whenNotPaused
```
- **Purpose**: Stake AVAX into the current epoch
- **Parameters**: None (sends AVAX as msg.value)
- **Events**: `Deposited(epochId, msg.sender, amount)`
- **Requirements**: 
  - Epoch must be active
  - msg.value > 0

#### submitWinners(epochId, winners, signature)
```solidity
function submitWinners(uint256 epochId, address[] calldata winners, bytes calldata signature) 
    external nonReentrant whenNotPaused
```
- **Purpose**: Submit ranked list of winners for an epoch
- **Parameters**:
  - `epochId`: ID of the epoch
  - `winners`: Array of winner addresses (ranked)
  - `signature`: Backend signature of the winners list
- **Events**: `WinnersSubmitted(epochId, winners)`
- **Requirements**:
  - Epoch must be ended
  - Must be called by anyone with valid signature
  - Cannot be called more than once per epoch

#### claim(epochId)
```solidity
function claim(uint256 epochId) external nonReentrant
```
- **Purpose**: Claim prize for a won epoch
- **Parameters**:
  - `epochId`: ID of the epoch to claim from
- **Events**: `Claimed(epochId, msg.sender, amount)`
- **Requirements**:
  - Epoch must be finalized
  - Caller must be a winner
  - Can only claim once per epoch

#### poke()
```solidity
function poke() external nonReentrant
```
- **Purpose**: Trigger epoch close/finalize if conditions are met
- **Events**: `EpochClosed(epochId)`, `EpochFinalized(epochId)`
- **Requirements**:
  - Epoch must be ended
  - Winners must be submitted (for finalization)

## RealAaveIntegration

### Key Functions

#### depositToAave(amount)
```solidity
function depositToAave(uint256 amount) external payable nonReentrant whenNotPaused
```
- **Purpose**: Deposit AVAX to Aave v3
- **Parameters**:
  - `amount`: Amount of AVAX to deposit (in wei)
- **Events**: `DepositedToAave(msg.sender, amount)`
- **Requirements**:
  - Must be called by EpochPrizePool
  - msg.value must match amount

#### withdrawFromAave(amount)
```solidity
function withdrawFromAave(uint256 amount) external nonReentrant whenNotPaused
```
- **Purpose**: Withdraw AVAX from Aave v3
- **Parameters**:
  - `amount`: Amount of AVAX to withdraw (in wei)
- **Events**: `WithdrawnFromAave(msg.sender, amount)`
- **Requirements**:
  - Must be called by EpochPrizePool
  - Sufficient balance must be available

## Integration Flow

### 1. Deposit Phase
1. User calls `EpochPrizePool.deposit{value: X}()`
2. Contract transfers AVAX to RealAaveIntegration
3. RealAaveIntegration deposits to Aave v3 via WAVAX gateway

### 2. Epoch Close
1. Epoch end time is reached
2. Anyone can call `poke()` to close the epoch
3. Contract calculates interest earned during epoch

### 3. Winner Submission
1. Backend generates signature for winners list
2. Anyone can call `submitWinners(epochId, winners, signature)`
3. Contract verifies signature and stores winners

### 4. Finalization
1. After winners are submitted, `poke()` can be called again
2. Contract calculates prize distribution
3. Epoch is marked as finalized

### 5. Prize Claim
1. Winners call `claim(epochId)`
2. Contract transfers prize amount to winner

## Helper Scripts

### integration_epoch_prize_pool.js
Main integration test script that demonstrates the complete flow:
1. Deposit AVAX to current epoch
2. Submit winners (if configured)
3. Close/finalize epoch
4. Claim prizes
5. Withdraw fees (owner only)

### check_current_aave.js
Check which Aave integration is currently configured in the pool.

### switch_to_real_aave.js
Switch the pool to use RealAaveIntegration.

## Environment Variables

```bash
# Required
PRIVATE_KEY=your_private_key
FUJI_RPC_URL=your_fuji_rpc_url

# Contract Addresses (or read from DEPLOYMENTS.md)
EPOCH_PRIZE_POOL=0x...
REAL_AAVE_INTEGRATION=0x...

# For testing with winners
WINNER_SIGNER_PK=private_key_for_signing_winners
WINNERS_CSV=0xAddr1,0xAddr2,0xAddr3
```
