const { ethers } = require("hardhat");

async function main() {
  const POOL_ADDR = "0xbE7BC82d2E16b3d139C96A26a8Ac3d61ce290694";
  const pool = await ethers.getContractAt("EpochPrizePool", POOL_ADDR);
  
  console.log("EpochPrizePool:", POOL_ADDR);
  
  try {
    const aaveIntegration = await pool.aave();
    console.log("Current Aave Integration:", aaveIntegration);
    
    // Check which one it is
    const REAL_AAVE = "0xe9782b8942D563210C7a36F2B309939A8ae08509";
    const MOCK_AAVE = "0x97237cF4B21B185Aa181fc69249B5B49630ab74c";
    
    if (aaveIntegration.toLowerCase() === REAL_AAVE.toLowerCase()) {
      console.log("✅ Using REAL Aave Integration");
    } else if (aaveIntegration.toLowerCase() === MOCK_AAVE.toLowerCase()) {
      console.log("❌ Using MOCK Aave Integration");
    } else {
      console.log("? Using unknown Aave Integration");
    }
    
  } catch (error) {
    console.error("Error reading aave integration:", error.message);
  }
}

main().catch(console.error);
