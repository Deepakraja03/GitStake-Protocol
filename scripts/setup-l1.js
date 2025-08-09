const fs = require('fs');
const path = require('path');

/**
 * Setup script for Avalanche L1 blockchain configuration
 * This script demonstrates the configuration needed for the custom L1
 */
async function setupL1() {
  console.log("🏔️  Setting up Avalanche L1 Blockchain Configuration");
  console.log("=" .repeat(60));
  
  // Read the L1 configuration
  const configPath = path.join(__dirname, '..', 'avalanche-l1-config.json');
  const genesisPath = path.join(__dirname, '..', 'genesis.json');
  
  try {
    const l1Config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const genesisConfig = JSON.parse(fs.readFileSync(genesisPath, 'utf8'));
    
    console.log("📋 L1 Network Configuration:");
    console.log(`   Name: ${l1Config.network.name}`);
    console.log(`   Chain ID: ${l1Config.network.chainId}`);
    console.log(`   Network ID: ${l1Config.network.networkId}`);
    console.log(`   VM ID: ${l1Config.network.vmId}`);
    
    console.log("\n⚙️  Blockchain Parameters:");
    console.log(`   Block Time: ${l1Config.blockchain.blockTime / 1000} seconds`);
    console.log(`   Block Gas Limit: ${l1Config.blockchain.blockGasLimit.toLocaleString()}`);
    console.log(`   Max Block Size: ${(l1Config.blockchain.maxBlockSize / 1024 / 1024).toFixed(2)} MB`);
    
    console.log("\n💰 Fee Configuration:");
    const feeConfig = genesisConfig.config.feeConfig;
    console.log(`   Gas Limit: ${feeConfig.gasLimit.toLocaleString()}`);
    console.log(`   Target Block Rate: ${feeConfig.targetBlockRate} seconds`);
    console.log(`   Min Base Fee: ${feeConfig.minBaseFee / 1e9} Gwei`);
    console.log(`   Target Gas: ${feeConfig.targetGas.toLocaleString()}`);
    
    console.log("\n🏦 Genesis Allocation:");
    const allocations = Object.entries(genesisConfig.alloc);
    allocations.forEach(([address, allocation]) => {
      const balance = BigInt(allocation.balance);
      const avaxBalance = Number(balance) / 1e18;
      console.log(`   ${address}: ${avaxBalance.toLocaleString()} AVAX`);
    });
    
    console.log("\n📝 Next Steps:");
    console.log("   1. Install Avalanche CLI: https://docs.avax.network/tooling/cli-guides/install-avalanche-cli");
    console.log("   2. Create L1 blockchain:");
    console.log("      avalanche blockchain create --config avalanche-l1-config.json");
    console.log("   3. Deploy L1 to local network:");
    console.log("      avalanche blockchain deploy --local");
    console.log("   4. Deploy staking contract:");
    console.log("      npx hardhat run scripts/deploy.js --network avalanche_l1");
    
    console.log("\n✅ L1 configuration files are ready!");
    console.log("   - avalanche-l1-config.json: L1 blockchain configuration");
    console.log("   - genesis.json: Genesis block configuration");
    console.log("   - hardhat.config.js: Hardhat network configuration");
    
  } catch (error) {
    console.error("❌ Error reading configuration files:", error.message);
    process.exit(1);
  }
}

// Execute setup if this script is run directly
if (require.main === module) {
  setupL1()
    .then(() => {
      console.log("\n🎉 Setup completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Setup failed:", error);
      process.exit(1);
    });
}

module.exports = setupL1;