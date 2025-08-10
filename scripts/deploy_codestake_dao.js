const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Starting CodeStake DAO deployment...");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    // Get existing contract addresses (replace with actual deployed addresses)
    const STAKING_CONTRACT = process.env.STAKING_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
    const REWARD_DISTRIBUTION = process.env.REWARD_DISTRIBUTION_ADDRESS || "0x0000000000000000000000000000000000000000";
    const AAVE_INTEGRATION = process.env.AAVE_INTEGRATION_ADDRESS || "0x0000000000000000000000000000000000000000";

    // If addresses are not provided, deploy test contracts first
    let stakingContract = STAKING_CONTRACT;
    let rewardDistribution = REWARD_DISTRIBUTION;
    let aaveIntegration = AAVE_INTEGRATION;

    if (stakingContract === "0x0000000000000000000000000000000000000000") {
        console.log("⚠️  No staking contract address provided. Deploying StakingContract...");
        
        const StakingContract = await ethers.getContractFactory("StakingContract");
        const stakingContractInstance = await StakingContract.deploy(
            ethers.parseEther("0.1"), // minimumStakeAmount: 0.1 AVAX
            86400, // minimumLockPeriod: 1 day
            31536000 // maximumLockPeriod: 1 year
        );
        await stakingContractInstance.waitForDeployment();
        stakingContract = await stakingContractInstance.getAddress();
        console.log("✅ StakingContract deployed to:", stakingContract);
    }

    if (rewardDistribution === "0x0000000000000000000000000000000000000000") {
        console.log("⚠️  No reward distribution address provided. Deploying RewardDistribution...");
        
        const RewardDistribution = await ethers.getContractFactory("RewardDistribution");
        const rewardDistributionInstance = await RewardDistribution.deploy(
            ethers.parseEther("0.01"), // minimumClaimAmount: 0.01 AVAX
            3600 // rewardUpdateInterval: 1 hour
        );
        await rewardDistributionInstance.waitForDeployment();
        rewardDistribution = await rewardDistributionInstance.getAddress();
        console.log("✅ RewardDistribution deployed to:", rewardDistribution);
    }

    if (aaveIntegration === "0x0000000000000000000000000000000000000000") {
        console.log("⚠️  No Aave integration address provided. Deploying AaveIntegration...");
        
        const AaveIntegration = await ethers.getContractFactory("AaveIntegration");
        const aaveIntegrationInstance = await AaveIntegration.deploy();
        await aaveIntegrationInstance.waitForDeployment();
        aaveIntegration = await aaveIntegrationInstance.getAddress();
        console.log("✅ AaveIntegration deployed to:", aaveIntegration);
    }

    // Deploy CodeStakeDAO
    console.log("\n📜 Deploying CodeStakeDAO contract...");
    
    const CodeStakeDAO = await ethers.getContractFactory("CodeStakeDAO");
    const codeStakeDAO = await CodeStakeDAO.deploy(
        stakingContract,
        rewardDistribution,
        aaveIntegration
    );

    await codeStakeDAO.waitForDeployment();
    const daoAddress = await codeStakeDAO.getAddress();

    console.log("✅ CodeStakeDAO deployed to:", daoAddress);

    // Initial setup
    console.log("\n🔧 Performing initial setup...");

    try {
        // Fund the treasury with initial funds (1 AVAX)
        const fundTx = await codeStakeDAO.fundTreasury({ value: ethers.parseEther("1.0") });
        await fundTx.wait();
        console.log("✅ Treasury funded with 1 AVAX");

        // Add some sample GitHub repositories
        const sampleRepos = [
            "https://github.com/ava-labs/avalanche-cli",
            "https://github.com/ava-labs/subnet-evm",
            "https://github.com/ava-labs/avalanchego"
        ];

        for (let i = 0; i < sampleRepos.length; i++) {
            const addRepoTx = await codeStakeDAO.addGitHubRepo(
                sampleRepos[i],
                deployer.address,
                100 + (i * 50), // weight
                ["commits", "pull_requests", "issues"] // allowed contribution types
            );
            await addRepoTx.wait();
            console.log(`✅ Added GitHub repo: ${sampleRepos[i]}`);
        }

        // Create some sample AI challenges
        const sampleChallenges = [
            {
                title: "Avalanche Smart Contract Optimization",
                description: "Optimize a smart contract for gas efficiency on Avalanche C-Chain",
                difficulty: 7,
                rewardMultiplier: 15000, // 150%
                skills: ["solidity", "gas-optimization", "avalanche"],
                timeLimit: 86400 * 3 // 3 days
            },
            {
                title: "Subnet Development Challenge",
                description: "Build a custom subnet with specific validation logic",
                difficulty: 9,
                rewardMultiplier: 25000, // 250%
                skills: ["go", "blockchain", "subnet"],
                timeLimit: 86400 * 7 // 1 week
            },
            {
                title: "DeFi Integration Task",
                description: "Integrate with multiple DeFi protocols on Avalanche",
                difficulty: 8,
                rewardMultiplier: 20000, // 200%
                skills: ["solidity", "defi", "integration"],
                timeLimit: 86400 * 5 // 5 days
            }
        ];

        for (const challenge of sampleChallenges) {
            const createChallengeTx = await codeStakeDAO.createAIChallenge(
                challenge.title,
                challenge.description,
                challenge.difficulty,
                challenge.rewardMultiplier,
                challenge.skills,
                challenge.timeLimit
            );
            await createChallengeTx.wait();
            console.log(`✅ Created AI Challenge: ${challenge.title}`);
        }

        // Verify the deployer as a developer
        const verifyTx = await codeStakeDAO.verifyDeveloper(
            deployer.address,
            "sample_github_user",
            "0x" + Buffer.from("sample_proof").toString("hex") // Sample proof
        );
        await verifyTx.wait();
        console.log("✅ Deployer verified as developer");

    } catch (error) {
        console.log("⚠️  Initial setup partially failed:", error.message);
    }

    // Display deployment summary
    console.log("\n📋 Deployment Summary:");
    console.log("========================");
    console.log("Deployer:", deployer.address);
    console.log("Network:", hre.network.name);
    console.log("StakingContract:", stakingContract);
    console.log("RewardDistribution:", rewardDistribution);
    console.log("AaveIntegration:", aaveIntegration);
    console.log("CodeStakeDAO:", daoAddress);
    console.log("========================");

    // Display governance info
    console.log("\n🏛️  Governance Parameters:");
    console.log("Voting Delay:", "1 day");
    console.log("Voting Period:", "7 days");
    console.log("Execution Delay:", "2 days");
    console.log("Proposal Threshold:", "1000 AVAX");
    console.log("Quorum Threshold:", "50%");
    console.log("Pass Threshold:", "51%");

    // Display treasury info
    const treasuryInfo = await codeStakeDAO.getTreasuryInfo();
    console.log("\n💰 Treasury Information:");
    console.log("Balance:", ethers.formatEther(treasuryInfo.balance), "AVAX");
    console.log("Reward Pool:", (treasuryInfo.allocation.rewardPoolPercentage / 100).toString(), "%");
    console.log("Development Fund:", (treasuryInfo.allocation.developmentFundPercentage / 100).toString(), "%");
    console.log("AI Infrastructure:", (treasuryInfo.allocation.aiInfrastructurePercentage / 100).toString(), "%");
    console.log("Community Incentives:", (treasuryInfo.allocation.communityIncentivesPercentage / 100).toString(), "%");
    console.log("Reserve:", (treasuryInfo.allocation.reservePercentage / 100).toString(), "%");

    // Save deployment addresses to environment file
    const fs = require('fs');
    const deploymentData = `
# CodeStake DAO Deployment Addresses
STAKING_CONTRACT_ADDRESS=${stakingContract}
REWARD_DISTRIBUTION_ADDRESS=${rewardDistribution}
AAVE_INTEGRATION_ADDRESS=${aaveIntegration}
CODESTAKE_DAO_ADDRESS=${daoAddress}

# Network Information
NETWORK=${hre.network.name}
DEPLOYER_ADDRESS=${deployer.address}
DEPLOYMENT_TIMESTAMP=${new Date().toISOString()}
`;

    try {
        fs.writeFileSync('.env.deployment', deploymentData);
        console.log("\n✅ Deployment addresses saved to .env.deployment");
    } catch (error) {
        console.log("⚠️  Could not save deployment addresses:", error.message);
    }

    console.log("\n🎉 CodeStake DAO deployment completed successfully!");
    
    return {
        dao: daoAddress,
        staking: stakingContract,
        rewards: rewardDistribution,
        aave: aaveIntegration
    };
}

// Handle errors
main()
    .then((addresses) => {
        console.log("\n🏁 All contracts deployed successfully!");
        console.log("Contract addresses:", addresses);
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });

module.exports = main;
