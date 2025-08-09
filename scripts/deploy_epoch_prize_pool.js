const { ethers } = require("hardhat");

async function main() {
  const network = (await ethers.provider.getNetwork()).name || hre.network.name;
  console.log(`\nDeploying to network: ${hre.network.name}`);

  const {
    EPOCH_DURATION,
    FEE_BPS,
    NUM_WINNERS,
    DECAY_BPS,
    WINNER_SIGNER,
  } = process.env;

  const epochDuration = EPOCH_DURATION ? Number(EPOCH_DURATION) : 7 * 24 * 60 * 60; // 7 days
  const feeBps = FEE_BPS ? Number(FEE_BPS) : 1000; // 10%
  const numWinners = NUM_WINNERS ? Number(NUM_WINNERS) : 3;
  const decayBps = DECAY_BPS ? Number(DECAY_BPS) : 6000; // 0.6

  console.log("Params:");
  console.log({ epochDuration, feeBps, numWinners, decayBps, winnerSigner: WINNER_SIGNER });

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 1) Deploy AaveIntegration (mock in this repo)
  const AaveIntegration = await ethers.getContractFactory("AaveIntegration");
  const aave = await AaveIntegration.deploy();
  await aave.waitForDeployment();
  const aaveAddr = await aave.getAddress();
  console.log("AaveIntegration:", aaveAddr);

  // 2) Deploy EpochPrizePool
  const EpochPrizePool = await ethers.getContractFactory("EpochPrizePool");
  const pool = await EpochPrizePool.deploy(
    aaveAddr,
    epochDuration,
    feeBps,
    numWinners,
    decayBps
  );
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("EpochPrizePool:", poolAddr);

  // 3) Authorize pool to withdraw from Aave
  const txAuth = await aave.addAuthorizedContract(poolAddr);
  await txAuth.wait();
  console.log("Aave authorized contract:", poolAddr);

  // 4) Set winner signer if provided
  if (WINNER_SIGNER) {
    const txSigner = await pool.setWinnerSigner(WINNER_SIGNER);
    await txSigner.wait();
    console.log("Winner signer set:", WINNER_SIGNER);
  } else {
    console.log("Warning: WINNER_SIGNER not set. Please call setWinnerSigner() later.");
  }

  console.log("\nDeployment summary:");
  console.log(JSON.stringify({
    network: hre.network.name,
    aaveIntegration: aaveAddr,
    epochPrizePool: poolAddr,
    params: { epochDuration, feeBps, numWinners, decayBps, winnerSigner: WINNER_SIGNER || null },
    owner: deployer.address,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

