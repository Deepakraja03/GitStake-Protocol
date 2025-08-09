const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Parameters
  const MINIMUM_STAKE_AMOUNT = ethers.parseEther("1"); // 1 AVAX
  const MINIMUM_LOCK_PERIOD = 86400; // 1 day
  const MAXIMUM_LOCK_PERIOD = 31536000; // 1 year

  const MINIMUM_CLAIM_AMOUNT = ethers.parseEther("0.001"); // adjust as needed
  const REWARD_UPDATE_INTERVAL = 3600; // 1 hour

  // 1) Deploy AaveIntegration (mock integration in this repo)
  console.log("\nDeploying AaveIntegration (mock)...");
  const AaveIntegration = await ethers.getContractFactory("AaveIntegration");
  const aave = await AaveIntegration.deploy();
  await aave.waitForDeployment();
  const aaveAddr = await aave.getAddress();
  console.log("AaveIntegration:", aaveAddr);

  // 2) Deploy StakingContract
  console.log("\nDeploying StakingContract...");
  const StakingContract = await ethers.getContractFactory("StakingContract");
  const staking = await StakingContract.deploy(
    MINIMUM_STAKE_AMOUNT,
    MINIMUM_LOCK_PERIOD,
    MAXIMUM_LOCK_PERIOD
  );
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log("StakingContract:", stakingAddr);

  // 3) Deploy RewardDistribution
  console.log("\nDeploying RewardDistribution...");
  const RewardDistribution = await ethers.getContractFactory("RewardDistribution");
  const rewards = await RewardDistribution.deploy(
    MINIMUM_CLAIM_AMOUNT,
    REWARD_UPDATE_INTERVAL
  );
  await rewards.waitForDeployment();
  const rewardsAddr = await rewards.getAddress();
  console.log("RewardDistribution:", rewardsAddr);

  // 4) Wire contracts together
  console.log("\nWiring contracts...");
  // Allow staking contract to pull from AaveIntegration
  const txAuth = await aave.addAuthorizedContract(stakingAddr);
  await txAuth.wait();

  // Set Aave integration on staking
  const txSetAave = await staking.setAaveIntegration(aaveAddr);
  await txSetAave.wait();

  // Set reward distribution on staking
  const txSetRewardsOnStaking = await staking.setRewardDistribution(rewardsAddr);
  await txSetRewardsOnStaking.wait();

  // Set contracts on reward distribution
  const txSetContracts = await rewards.setContracts(stakingAddr, aaveAddr);
  await txSetContracts.wait();

  console.log("\nDeployment complete ✔\n");
  console.log("Addresses:");
  console.log("  AaveIntegration:", aaveAddr);
  console.log("  StakingContract:", stakingAddr);
  console.log("  RewardDistribution:", rewardsAddr);

  console.log("\nNext steps:");
  console.log("- Ensure your deployer EOA is permitted to deploy (no deployer allowlist precompile blocking).");
  console.log("- Fund RewardDistribution with AVAX if you want users to claim rewards (send AVAX to:", rewardsAddr + ")");
  console.log("- Stake with StakingContract by sending AVAX to stake(), then call rewards.updateRewards() and rewards.claimRewards().");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Deployment failed:", err);
      process.exit(1);
    });
}

module.exports = main;

