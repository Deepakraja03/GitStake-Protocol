const { ethers } = require("hardhat");

async function main() {
    console.log("🎯 SIMPLE EXAMPLE: How CodeStake DAO Works With All Contracts");
    console.log("=" * 70);
    
    // Get signers (Alice is our example developer)
    const [owner, alice, bob] = await ethers.getSigners();
    console.log("👩‍💻 Alice (Developer):", alice.address);
    console.log("💰 Alice's initial balance:", ethers.formatEther(await alice.provider.getBalance(alice.address)), "AVAX\n");

    // Deploy all contracts (in real deployment, these addresses are from .env)
    console.log("📦 Deploying contracts...");
    
    // 1. Deploy AaveIntegration
    const AaveIntegration = await ethers.getContractFactory("AaveIntegration");
    const aaveIntegration = await AaveIntegration.deploy();
    await aaveIntegration.waitForDeployment();
    console.log("✅ AaveIntegration:", await aaveIntegration.getAddress());

    // 2. Deploy StakingContract
    const StakingContract = await ethers.getContractFactory("StakingContract");
    const stakingContract = await StakingContract.deploy(
        ethers.parseEther("0.1"), // min stake: 0.1 AVAX
        86400, // min lock: 1 day  
        86400 * 365 // max lock: 1 year
    );
    await stakingContract.waitForDeployment();
    console.log("✅ StakingContract:", await stakingContract.getAddress());

    // 3. Deploy RewardDistribution
    const RewardDistribution = await ethers.getContractFactory("RewardDistribution");
    const rewardDistribution = await RewardDistribution.deploy(
        ethers.parseEther("0.01"), // min claim: 0.01 AVAX
        3600 // update interval: 1 hour
    );
    await rewardDistribution.waitForDeployment();
    console.log("✅ RewardDistribution:", await rewardDistribution.getAddress());

    // 4. Deploy CodeStakeDAO
    const CodeStakeDAO = await ethers.getContractFactory("CodeStakeDAO");
    const codeStakeDAO = await CodeStakeDAO.deploy(
        await stakingContract.getAddress(),
        await rewardDistribution.getAddress(),
        await aaveIntegration.getAddress()
    );
    await codeStakeDAO.waitForDeployment();
    console.log("✅ CodeStakeDAO:", await codeStakeDAO.getAddress());

    console.log("\n🔗 Setting up contract connections...");
    
    // Authorize StakingContract to withdraw from Aave
    await aaveIntegration.addAuthorizedContract(await stakingContract.getAddress());
    await aaveIntegration.addAuthorizedContract(await rewardDistribution.getAddress());
    
    // Set Aave integration in StakingContract  
    await stakingContract.setAaveIntegration(await aaveIntegration.getAddress());
    
    // Set contracts in RewardDistribution
    await rewardDistribution.setContracts(
        await stakingContract.getAddress(),
        await aaveIntegration.getAddress()
    );

    console.log("✅ All contracts connected!\n");

    // =====================================================
    // STEP 1: Alice Stakes AVAX
    // =====================================================
    console.log("💎 STEP 1: Alice Stakes 1000 AVAX");
    console.log("-".repeat(40));
    
    const stakeAmount = ethers.parseEther("1000");
    const lockPeriod = 7 * 24 * 60 * 60; // 7 days
    
    const stakeTx = await stakingContract.connect(alice).stake(lockPeriod, { 
        value: stakeAmount 
    });
    await stakeTx.wait();
    
    console.log(`✅ Alice staked ${ethers.formatEther(stakeAmount)} AVAX for ${lockPeriod / 86400} days`);
    
    // Check staking position
    const aliceStaked = await stakingContract.userTotalStaked(alice.address);
    console.log(`📊 Alice's total staked: ${ethers.formatEther(aliceStaked)} AVAX`);
    
    // Check Aave balance (Alice's stake should be there)
    const aaveBalance = await aaveIntegration.getATokenBalance();
    console.log(`🏦 Aave balance: ${ethers.formatEther(aaveBalance)} AVAX\n`);

    // =====================================================
    // STEP 2: Alice Verifies GitHub
    // =====================================================
    console.log("👩‍💻 STEP 2: Alice Verifies Her GitHub Profile");
    console.log("-".repeat(50));
    
    const verifyTx = await codeStakeDAO.connect(owner).verifyDeveloper(
        alice.address,
        "alice_dev_2024",
        ethers.hexlify(ethers.toUtf8Bytes("github_proof_alice"))
    );
    await verifyTx.wait();
    
    console.log("✅ Alice verified as developer: alice_dev_2024");
    
    // Check Alice's profile
    const aliceProfile = await codeStakeDAO.getDeveloperProfile(alice.address);
    console.log(`📝 GitHub username: ${aliceProfile.githubUsername}`);
    console.log(`✨ Verified: ${aliceProfile.verified}`);
    console.log(`⭐ Karma points: ${aliceProfile.karmaPoints.toString()}\n`);

    // =====================================================
    // STEP 3: Create AI Challenge
    // =====================================================
    console.log("🤖 STEP 3: Creating AI Challenge");
    console.log("-".repeat(35));
    
    const challengeTx = await codeStakeDAO.connect(owner).createAIChallenge(
        "Avalanche Smart Contract Optimization",
        "Optimize gas usage in a DeFi contract on Avalanche",
        8, // difficulty
        20000, // 200% reward multiplier
        ["solidity", "gas-optimization", "avalanche"],
        86400 * 3 // 3 days time limit
    );
    await challengeTx.wait();
    
    console.log("✅ AI Challenge created: Avalanche Smart Contract Optimization");
    
    // Get challenge details
    const challenge = await codeStakeDAO.getAIChallenge(1);
    console.log(`🎯 Difficulty: ${challenge.difficulty}/10`);
    console.log(`💎 Reward Multiplier: ${Number(challenge.rewardMultiplier) / 100}%`);
    console.log(`⏱️  Time Limit: ${Number(challenge.timeLimit) / 86400} days\n`);

    // =====================================================
    // STEP 4: Alice Completes AI Challenge
    // =====================================================
    console.log("🎯 STEP 4: Alice Completes AI Challenge");
    console.log("-".repeat(42));
    
    // Fund the treasury for challenge rewards
    const fundTx = await codeStakeDAO.connect(owner).fundTreasury({ value: ethers.parseEther("10") });
    await fundTx.wait();
    console.log("💰 Funded treasury with 10 AVAX for challenge rewards");
    
    const completeTx = await codeStakeDAO.connect(alice).completeAIChallenge(
        1, // challenge ID
        ethers.hexlify(ethers.toUtf8Bytes("Alice's optimized contract solution")),
        ethers.hexlify(ethers.randomBytes(64)) // mock AI signature
    );
    await completeTx.wait();
    
    console.log("✅ Alice completed AI Challenge #1");
    
    // Check completion status
    const completed = await codeStakeDAO.challengeCompletions(alice.address, 1);
    console.log(`✨ Challenge completion confirmed: ${completed}`);
    
    // Updated challenge shows completion count
    const updatedChallenge = await codeStakeDAO.getAIChallenge(1);
    console.log(`📊 Challenge completions: ${updatedChallenge.completionCount.toString()}\n`);

    // =====================================================
    // STEP 5: Simulate Time Passing & Interest Accrual  
    // =====================================================
    console.log("⏰ STEP 5: Time Passes - Interest Accrues");
    console.log("-".repeat(43));
    
    // Simulate 30 days passing by manually updating interest
    // (In real Aave, this happens automatically)
    console.log("🕐 Simulating 30 days of Aave yield...");
    
    // Simulate 5% APY on 1000 AVAX for 1 month = ~4.17 AVAX
    const monthlyInterest = ethers.parseEther("4.17");
    
    // Add interest to AaveIntegration (simulate Aave yield)
    await owner.sendTransaction({
        to: await aaveIntegration.getAddress(),
        value: monthlyInterest
    });
    
    console.log(`💰 Simulated interest earned: ${ethers.formatEther(monthlyInterest)} AVAX`);
    
    const totalInterest = await aaveIntegration.getAccruedInterest();
    console.log(`📈 Total accrued interest: ${ethers.formatEther(totalInterest)} AVAX\n`);

    // =====================================================
    // STEP 6: Alice Claims Rewards
    // =====================================================
    console.log("💰 STEP 6: Alice Claims Her Rewards");
    console.log("-".repeat(38));
    
    // Update rewards in the system
    await rewardDistribution.updateRewards();
    
    // Check Alice's claimable reward
    const aliceReward = await rewardDistribution.calculateUserReward(alice.address);
    console.log(`💎 Alice's claimable reward: ${ethers.formatEther(aliceReward)} AVAX`);
    
    const minClaimAmount = ethers.parseEther("0.01");
    if (aliceReward >= minClaimAmount) {
        const claimTx = await rewardDistribution.connect(alice).claimRewards();
        await claimTx.wait();
        console.log("✅ Alice claimed her rewards!");
    } else {
        console.log("⚠️  Reward below minimum claim amount (0.01 AVAX) - this is normal in a quick test");
        console.log("    📊 In a real system with more time and stakers, rewards would be larger");
    }

    // =====================================================
    // STEP 7: Alice Participates in Governance
    // =====================================================
    console.log("\n🗳️  STEP 7: Alice Creates Governance Proposal");
    console.log("-".repeat(48));
    
    // Alice has enough stake to create proposals
    const aliceVotingWeight = await codeStakeDAO.getVotingWeight(alice.address);
    console.log(`⚖️  Alice's voting weight: ${aliceVotingWeight.toString()}`);
    
    const proposalData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "uint256"],
        ["votingPeriod", 14 * 24 * 60 * 60] // Increase voting period to 14 days
    );
    
    const proposalTx = await codeStakeDAO.connect(alice).createProposal(
        0, // PARAMETER_CHANGE
        "Extend Voting Period",
        "Increase voting period from 7 to 14 days for better participation",
        proposalData,
        ["governance", "voting", "participation"]
    );
    await proposalTx.wait();
    
    console.log("✅ Alice created governance proposal: 'Extend Voting Period'");
    
    // Check proposal
    const proposal = await codeStakeDAO.getProposal(1);
    console.log(`📋 Proposal title: ${proposal.title}`);
    console.log(`👤 Proposer: ${proposal.proposer === alice.address ? 'Alice' : 'Unknown'}`);
    console.log(`🗳️  Votes for: ${proposal.votesFor.toString()}`);

    // =====================================================
    // FINAL SUMMARY
    // =====================================================
    console.log("\n" + "=".repeat(70));
    console.log("🎉 EXAMPLE COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(70));
    
    console.log("\n📊 ALICE'S FINAL STATUS:");
    console.log(`💎 Staked Amount: ${ethers.formatEther(aliceStaked)} AVAX`);
    console.log(`⚖️  Voting Power: ${aliceVotingWeight.toString()}`);
    console.log(`✨ Verified Developer: ${aliceProfile.verified}`);
    console.log(`🎯 AI Challenges Completed: 1`);
    console.log(`🗳️  Governance Proposals Created: 1`);
    
    console.log("\n🏦 SYSTEM STATUS:");
    const treasuryInfo = await codeStakeDAO.getTreasuryInfo();
    console.log(`💰 DAO Treasury: ${ethers.formatEther(treasuryInfo.balance)} AVAX`);
    console.log(`🏛️  Total Aave Deposits: ${ethers.formatEther(aaveBalance)} AVAX`);
    console.log(`📈 Accrued Interest: ${ethers.formatEther(totalInterest)} AVAX`);
    
    console.log("\n✅ ALL CONTRACTS WORKING TOGETHER:");
    console.log("   🔸 StakingContract: Manages Alice's 1000 AVAX stake");
    console.log("   🔸 AaveIntegration: Earns yield on staked funds");  
    console.log("   🔸 RewardDistribution: Distributes yield as rewards");
    console.log("   🔸 CodeStakeDAO: Governs everything + tracks contributions");
    
    console.log("\n🎯 KEY INSIGHT: Alice's 1000 AVAX is simultaneously:");
    console.log("   • Earning 5% APY through Aave");
    console.log("   • Giving her governance voting power");
    console.log("   • Funding the reward pool for all developers");
    console.log("   • Backing her participation in AI challenges");
    
    console.log("\n💡 THIS CREATES A SUSTAINABLE ECOSYSTEM WHERE:");
    console.log("   ✓ Developers earn rewards from real yield (not inflation)");
    console.log("   ✓ Contributions are tracked and fairly compensated");
    console.log("   ✓ Community governs itself through DAO voting");
    console.log("   ✓ AI challenges encourage skill development");
    console.log("   ✓ Everyone benefits from the collective staking pool");

    console.log("\n🚀 YES, IT ACTUALLY WORKS! 🚀");
}

main()
    .then(() => {
        console.log("\n✅ Simple example completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Example failed:", error);
        process.exit(1);
    });
