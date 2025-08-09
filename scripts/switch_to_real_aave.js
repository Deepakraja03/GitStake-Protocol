const { ethers } = require("hardhat");

async function main() {
  const POOL_ADDR = "0xbE7BC82d2E16b3d139C96A26a8Ac3d61ce290694";
  const REAL_AAVE_ADDR = "0xe9782b8942D563210C7a36F2B309939A8ae08509";
  const MOCK_AAVE_ADDR = "0x97237cF4B21B185Aa181fc69249B5B49630ab74c";
  
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  
  const pool = await ethers.getContractAt("EpochPrizePool", POOL_ADDR);
  
  // Check current integration
  const currentIntegration = await pool.aave();
  console.log("Current Aave Integration:", currentIntegration);
  
  if (currentIntegration.toLowerCase() === REAL_AAVE_ADDR.toLowerCase()) {
    console.log("✅ Already using Real Aave Integration!");
    return;
  }
  
  if (currentIntegration.toLowerCase() !== MOCK_AAVE_ADDR.toLowerCase()) {
    console.log("❓ Unknown current integration, proceeding anyway...");
  }
  
  console.log("\n🔄 Switching to Real Aave Integration...");
  
  // Switch to real Aave integration
  const tx = await pool.setAaveIntegration(REAL_AAVE_ADDR);
  const receipt = await tx.wait();
  
  console.log("✅ Transaction successful!");
  console.log("Transaction hash:", receipt.hash);
  console.log("Gas used:", receipt.gasUsed.toString());
  
  // Verify the change
  const newIntegration = await pool.aave();
  console.log("\n📋 Verification:");
  console.log("New Aave Integration:", newIntegration);
  
  if (newIntegration.toLowerCase() === REAL_AAVE_ADDR.toLowerCase()) {
    console.log("✅ Successfully switched to Real Aave Integration!");
  } else {
    console.log("❌ Switch failed - still using wrong integration");
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
