const { ethers } = require("hardhat");

// Fuji addresses from Aave Address Book
const { AaveV3Fuji } = require("@bgd-labs/aave-address-book");
const FUJI_ADDRESSES = {
  ADDRESSES_PROVIDER: AaveV3Fuji.POOL_ADDRESSES_PROVIDER,
  // The Aave address book doesn't expose WETH_GATEWAY on Fuji.
  // Provide it via env to avoid hardcoding in code.
  WRAPPED_NATIVE_GATEWAY: process.env.FUJI_WRAPPED_NATIVE_GATEWAY,
  WAVAX: AaveV3Fuji.ASSETS.WAVAX.UNDERLYING,
};

async function main() {
  const { ADDRESSES_PROVIDER, WRAPPED_NATIVE_GATEWAY, WAVAX } = FUJI_ADDRESSES;

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Parameters
  const MINIMUM_STAKE_AMOUNT = ethers.parseEther("0.1");
  const MINIMUM_LOCK_PERIOD = 86400; // 1 day
  const MAXIMUM_LOCK_PERIOD = 31536000; // 1 year
  const MINIMUM_CLAIM_AMOUNT = ethers.parseEther("0.001");
  const REWARD_UPDATE_INTERVAL = 3600; // 1 hour

  // 1) Deploy RealAaveIntegration
  console.log("\nDeploying RealAaveIntegration (Fuji Aave v3)...");
  const RealAave = await ethers.getContractFactory("RealAaveIntegration");
  const realAave = await RealAave.deploy(
    ADDRESSES_PROVIDER,
    WRAPPED_NATIVE_GATEWAY,
    WAVAX
  );
  await realAave.waitForDeployment();
  const realAaveAddr = await realAave.getAddress();
  console.log("RealAaveIntegration:", realAaveAddr);

  // 2) Deploy StakingContract
  console.log("\nDeploying StakingContract...");
  const Staking = await ethers.getContractFactory("StakingContract");
  const staking = await Staking.deploy(
    MINIMUM_STAKE_AMOUNT,
    MINIMUM_LOCK_PERIOD,
    MAXIMUM_LOCK_PERIOD
  );
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log("StakingContract:", stakingAddr);

  // 3) Deploy RewardDistribution
  console.log("\nDeploying RewardDistribution...");
  const Rewards = await ethers.getContractFactory("RewardDistribution");
  const rewards = await Rewards.deploy(
    MINIMUM_CLAIM_AMOUNT,
    REWARD_UPDATE_INTERVAL
  );
  await rewards.waitForDeployment();
  const rewardsAddr = await rewards.getAddress();
  console.log("RewardDistribution:", rewardsAddr);

  // 4) Wire contracts
  console.log("\nWiring...");
  await (await realAave.addAuthorizedContract(stakingAddr)).wait();
  await (await staking.setAaveIntegration(realAaveAddr)).wait();
  await (await staking.setRewardDistribution(rewardsAddr)).wait();
  await (await rewards.setContracts(stakingAddr, realAaveAddr)).wait();

  console.log("\nDeployed & wired ✔\n");
  console.log({ realAaveAddr, stakingAddr, rewardsAddr });
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = main;

