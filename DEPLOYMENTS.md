# Deployments

This file records contract addresses for the GitStake Protocol deployment using bgd-labs/aave-address-book integration.

## Latest Deployment - Network: Fuji (Avalanche Testnet)

- Deployer/Owner: `0x95Cf028D5e86863570E300CAD14484Dc2068eB79`
- Winner Signer: `0x95Cf028D5e86863570E300CAD14484Dc2068eB79`
- RealAaveIntegration: `0xe9782b8942D563210C7a36F2B309939A8ae08509`
- StakingContract: `0xDedd1411952ec1FE6d8102fabC98DD8982B8196d`
- RewardDistribution: `0xa76C8826bf40632836cC00A23dEdF02dd920DadF`
- EpochPrizePool: `0xbE7BC82d2E16b3d139C96A26a8Ac3d61ce290694`
- MockAaveIntegration: `0x97237cF4B21B185Aa181fc69249B5B49630ab74c`

## Previous Deployment - Network: Fuji (Avalanche Testnet)

- Deployer/Owner: `0x95Cf028D5e86863570E300CAD14484Dc2068eB79`
- Winner Signer: `0x95Cf028D5e86863570E300CAD14484Dc2068eB79`
- AaveIntegration: `0xf8d499b0fB4878Dc32A98647C330402Fc23Bd754`
- EpochPrizePool: `0x5fa5A6e4969b0E1766cbFeD18B19F3042dA2BDd7`

### Aave V3 Integration Configuration (bgd-labs/aave-address-book)

- Pool Addresses Provider: `0x07D04EfAAA0Ac69D19d107795aF247C42Eb50F1C`
- WAVAX Underlying: `0xd00ae08403B9bbb9124bB305C09058E32C39A48c`
- WETH Gateway: `0x3d2ee1AB8C3a597cDf80273C684dE0036481bE3a`
- Pool: `0x8B9b2AF4afB389b4a70A474dfD4AdCD4a302bb40`
- Oracle: `0xd36338d0F231446b36008310f1DE0812784ADeBC`

### Constructor / Config Params

- epochDuration: `604800` (7 days)
- feeBps: `1000` (10% fee on yield only)
- numWinners: `3`
- decayBps: `6000` (exponential factor 0.6)

### Post-Deploy Steps Performed

- Authorized EpochPrizePool on AaveIntegration
- Set winner signer on EpochPrizePool

### Notes

- Epochs auto-close/finalize at endTime upon the next interaction (deposit/claim/poke).
- Backend must submit winners for each epoch:
  - submitWinners(epochId, winners[], signature)
  - signature is eth_sign over keccak256(abi.encode(address(this), epochId, winners))
- Fee is escrowed in the pool; owner can withdraw via withdrawFees(amount, to).


