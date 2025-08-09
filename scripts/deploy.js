const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying StakingContract...");
  
  // Deployment parameters
  const MINIMUM_STAKE_AMOUNT = ethers.parseEther("1"); // 1 AVAX minimum
  const MINIMUM_LOCK_PERIOD = 86400; // 1 day in seconds
  const MAXIMUM_LOCK_PERIOD = 31536000; // 1 year in seconds
  
  // Get the contract factory
  const StakingContract = await ethers.getContractFactory("StakingContract");
  
  // Deploy the contract
  const stakingContract = await StakingContract.deploy(
    MINIMUM_STAKE_AMOUNT,
    MINIMUM_LOCK_PERIOD,
    MAXIMUM_LOCK_PERIOD
  );
  
  await stakingContract.waitForDeployment();
  
  const contractAddress = await stakingContract.getAddress();
  
  console.log("StakingContract deployed to:", contractAddress);
  console.log("Deployment parameters:");
  console.log("- Minimum stake amount:", ethers.formatEther(MINIMUM_STAKE_AMOUNT), "AVAX");
  console.log("- Minimum lock period:", MINIMUM_LOCK_PERIOD / 86400, "days");
  console.log("- Maximum lock period:", MAXIMUM_LOCK_PERIOD / 86400, "days");
  
  // Verify deployment
  console.log("\nVerifying deployment...");
  const deployedMinStake = await stakingContract.minimumStakeAmount();
  const deployedMinLock = await stakingContract.minimumLockPeriod();
  const deployedMaxLock = await stakingContract.maximumLockPeriod();
  const totalStaked = await stakingContract.totalStaked();
  
  console.log("✓ Minimum stake amount:", ethers.formatEther(deployedMinStake), "AVAX");
  console.log("✓ Minimum lock period:", Number(deployedMinLock), "seconds");
  console.log("✓ Maximum lock period:", Number(deployedMaxLock), "seconds");
  console.log("✓ Total staked:", ethers.formatEther(totalStaked), "AVAX");
  
  console.log("\nDeployment completed successfully!");
  
  return {
    contract: stakingContract,
    address: contractAddress
  };
}

// Execute deployment if this script is run directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Deployment failed:", error);
      process.exit(1);
    });
}

module.exports = main;