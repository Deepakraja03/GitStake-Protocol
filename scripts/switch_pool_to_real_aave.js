const { ethers } = require("hardhat");
const { AaveV3Fuji } = require("@bgd-labs/aave-address-book");
const fs = require("fs");
const path = require("path");

function readFromDeploymentsFallback() {
  try {
    const file = fs.readFileSync(path.join(process.cwd(), "DEPLOYMENTS.md"), "utf8");
    const poolMatch = file.match(/EpochPrizePool:\s*`([^`]+)`/);
    return poolMatch ? poolMatch[1] : undefined;
  } catch (e) {
    return undefined;
  }
}

async function main() {
  const WRAPPED_NATIVE_GATEWAY = process.env.FUJI_WRAPPED_NATIVE_GATEWAY;
  if (!WRAPPED_NATIVE_GATEWAY) throw new Error("Missing FUJI_WRAPPED_NATIVE_GATEWAY env");

  const ADDRESSES_PROVIDER = AaveV3Fuji.POOL_ADDRESSES_PROVIDER;
  const WAVAX = AaveV3Fuji.ASSETS.WAVAX.UNDERLYING;

  const POOL_ADDR = process.env.EPOCH_PRIZE_POOL || readFromDeploymentsFallback();
  if (!POOL_ADDR) throw new Error("Provide EPOCH_PRIZE_POOL env or ensure DEPLOYMENTS.md exists");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer (must be pool owner):", deployer.address);
  console.log({ ADDRESSES_PROVIDER, WRAPPED_NATIVE_GATEWAY, WAVAX, POOL_ADDR });

  // Deploy RealAaveIntegration
  console.log("\nDeploying RealAaveIntegration...");
  const RealAave = await ethers.getContractFactory("RealAaveIntegration");
  const realAave = await RealAave.deploy(ADDRESSES_PROVIDER, WRAPPED_NATIVE_GATEWAY, WAVAX);
  await realAave.waitForDeployment();
  const realAaveAddr = await realAave.getAddress();
  console.log("RealAaveIntegration:", realAaveAddr);

  // Authorize pool in RealAaveIntegration
  console.log("Authorizing pool to withdraw...");
  const txAuth = await realAave.addAuthorizedContract(POOL_ADDR);
  const rcAuth = await txAuth.wait();
  console.log("✓ Authorize tx:", rcAuth.hash);

  // Switch EpochPrizePool to use RealAaveIntegration
  const pool = await ethers.getContractAt("EpochPrizePool", POOL_ADDR);
  console.log("Setting aave integration on pool...");
  const txSet = await pool.setAaveIntegration(realAaveAddr);
  const rcSet = await txSet.wait();
  console.log("✓ setAaveIntegration tx:", rcSet.hash);

  console.log("\nSwitched pool to real Aave integration ✔");
  console.log(JSON.stringify({
    network: hre.network.name,
    epochPrizePool: POOL_ADDR,
    realAaveIntegration: realAaveAddr,
    addressesProvider: ADDRESSES_PROVIDER,
    gateway: WRAPPED_NATIVE_GATEWAY,
    reserve: WAVAX,
  }, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = main;

