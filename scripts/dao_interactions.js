const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Comprehensive interaction script for CodeStake DAO
 * Demonstrates all major functionalities
 */
async function main() {
    console.log("🚀 CodeStake DAO Interaction Script");
    console.log("=====================================\n");

    // Get signers
    const [owner, developer1, developer2, user1, user2] = await ethers.getSigners();
    console.log("👥 Signers:");
    console.log(`   Owner: ${owner.address}`);
    console.log(`   Developer1: ${developer1.address}`);
    console.log(`   Developer2: ${developer2.address}`);
    console.log(`   User1: ${user1.address}`);
    console.log(`   User2: ${user2.address}\n`);

    // Contract addresses - update these with your deployed addresses
    const DAO_ADDRESS = process.env.CODESTAKE_DAO_ADDRESS;
    const STAKING_ADDRESS = process.env.STAKING_CONTRACT_ADDRESS;
    const REWARD_ADDRESS = process.env.REWARD_DISTRIBUTION_ADDRESS;
    const AAVE_ADDRESS = process.env.AAVE_INTEGRATION_ADDRESS;

    if (!DAO_ADDRESS) {
        console.log("❌ Please set CODESTAKE_DAO_ADDRESS in environment variables");
        process.exit(1);
    }

    // Get contract instances
    const codeStakeDAO = await ethers.getContractAt("CodeStakeDAO", DAO_ADDRESS);
    const stakingContract = STAKING_ADDRESS ? await ethers.getContractAt("StakingContract", STAKING_ADDRESS) : null;

    console.log("📋 Contract Addresses:");
    console.log(`   DAO: ${DAO_ADDRESS}`);
    console.log(`   Staking: ${STAKING_ADDRESS || 'Not set'}`);
    console.log(`   Rewards: ${REWARD_ADDRESS || 'Not set'}`);
    console.log(`   Aave: ${AAVE_ADDRESS || 'Not set'}\n`);

    try {
        // 1. Display current DAO status
        console.log("📊 Current DAO Status:");
        console.log("====================");
        
        const treasuryInfo = await codeStakeDAO.getTreasuryInfo();
        console.log(`💰 Treasury Balance: ${ethers.formatEther(treasuryInfo.balance)} AVAX`);
        console.log(`📈 Treasury Allocation:`);
        console.log(`   - Reward Pool: ${treasuryInfo.allocation.rewardPoolPercentage / 100}%`);
        console.log(`   - Development Fund: ${treasuryInfo.allocation.developmentFundPercentage / 100}%`);
        console.log(`   - AI Infrastructure: ${treasuryInfo.allocation.aiInfrastructurePercentage / 100}%`);
        console.log(`   - Community Incentives: ${treasuryInfo.allocation.communityIncentivesPercentage / 100}%`);
        console.log(`   - Reserve: ${treasuryInfo.allocation.reservePercentage / 100}%`);

        console.log(`\n🏛️  Governance Parameters:`);
        console.log(`   - Voting Delay: ${await codeStakeDAO.votingDelay()} seconds`);
        console.log(`   - Voting Period: ${await codeStakeDAO.votingPeriod()} seconds`);
        console.log(`   - Execution Delay: ${await codeStakeDAO.executionDelay()} seconds`);
        console.log(`   - Proposal Threshold: ${ethers.formatEther(await codeStakeDAO.proposalThreshold())} AVAX`);
        console.log(`   - Quorum Threshold: ${await codeStakeDAO.quorumThreshold() / 100}%`);
        console.log(`   - Pass Threshold: ${await codeStakeDAO.passThreshold() / 100}%\n`);

        // 2. Developer Verification Demo
        console.log("👨‍💻 Developer Verification Demo:");
        console.log("=================================");
        
        // Verify developers
        const developers = [
            { address: developer1.address, username: "avalanche_dev_1", signer: developer1 },
            { address: developer2.address, username: "avalanche_dev_2", signer: developer2 }
        ];

        for (const dev of developers) {
            try {
                const tx = await codeStakeDAO.connect(owner).verifyDeveloper(
                    dev.address,
                    dev.username,
                    ethers.hexlify(ethers.toUtf8Bytes(`proof_for_${dev.username}`))
                );
                await tx.wait();
                console.log(`✅ Verified developer: ${dev.username} (${dev.address})`);

                // Get developer profile
                const profile = await codeStakeDAO.getDeveloperProfile(dev.address);
                console.log(`   Profile: ${profile.githubUsername}, Karma: ${profile.karmaPoints}, Verified: ${profile.verified}`);
            } catch (error) {
                console.log(`⚠️  Developer verification failed for ${dev.username}: ${error.message}`);
            }
        }

        // 3. GitHub Repository Management Demo
        console.log("\n📚 GitHub Repository Management:");
        console.log("===============================");
        
        const repositories = [
            {
                url: "https://github.com/ava-labs/avalanche-cli",
                owner: developer1.address,
                weight: 150,
                types: ["commits", "pull_requests", "issues"]
            },
            {
                url: "https://github.com/ava-labs/subnet-evm", 
                owner: developer1.address,
                weight: 200,
                types: ["commits", "pull_requests", "code_reviews"]
            },
            {
                url: "https://github.com/ava-labs/coreth",
                owner: developer2.address,
                weight: 175,
                types: ["commits", "pull_requests", "issues", "documentation"]
            }
        ];

        for (const repo of repositories) {
            try {
                const tx = await codeStakeDAO.connect(owner).addGitHubRepo(
                    repo.url,
                    repo.owner,
                    repo.weight,
                    repo.types
                );
                await tx.wait();
                console.log(`✅ Added repository: ${repo.url} (weight: ${repo.weight})`);
            } catch (error) {
                console.log(`⚠️  Failed to add repo ${repo.url}: ${error.message}`);
            }
        }

        // 4. AI Challenges Demo
        console.log("\n🤖 AI Challenges Creation:");
        console.log("=========================");
        
        const challenges = [
            {
                title: "Avalanche Subnet Validator Optimization",
                description: "Optimize validator selection algorithm for custom Avalanche subnets with specific performance constraints",
                difficulty: 8,
                rewardMultiplier: 20000, // 200%
                skills: ["go", "consensus", "avalanche", "optimization"],
                timeLimit: 7 * 24 * 60 * 60 // 1 week
            },
            {
                title: "Cross-Chain Bridge Security Audit",
                description: "Perform comprehensive security analysis of cross-chain bridge implementation",
                difficulty: 9,
                rewardMultiplier: 30000, // 300%
                skills: ["solidity", "security", "bridge", "audit"],
                timeLimit: 14 * 24 * 60 * 60 // 2 weeks
            },
            {
                title: "DeFi Yield Farming Strategy",
                description: "Design and implement optimal yield farming strategy across Avalanche DeFi protocols",
                difficulty: 7,
                rewardMultiplier: 18000, // 180%
                skills: ["solidity", "defi", "yield-farming", "avalanche"],
                timeLimit: 5 * 24 * 60 * 60 // 5 days
            },
            {
                title: "Layer 1 Performance Benchmarking",
                description: "Create comprehensive benchmarking suite for Avalanche L1 performance metrics",
                difficulty: 6,
                rewardMultiplier: 15000, // 150%
                skills: ["go", "benchmarking", "performance", "metrics"],
                timeLimit: 10 * 24 * 60 * 60 // 10 days
            }
        ];

        for (let i = 0; i < challenges.length; i++) {
            const challenge = challenges[i];
            try {
                const tx = await codeStakeDAO.connect(owner).createAIChallenge(
                    challenge.title,
                    challenge.description,
                    challenge.difficulty,
                    challenge.rewardMultiplier,
                    challenge.skills,
                    challenge.timeLimit
                );
                await tx.wait();
                console.log(`✅ Created AI Challenge ${i + 1}: ${challenge.title}`);
                console.log(`   Difficulty: ${challenge.difficulty}/10, Reward: ${challenge.rewardMultiplier / 100}%, Time: ${challenge.timeLimit / (24 * 60 * 60)} days`);
            } catch (error) {
                console.log(`⚠️  Failed to create challenge ${challenge.title}: ${error.message}`);
            }
        }

        // 5. Bounty Program Demo
        console.log("\n💰 Bounty Programs Creation:");
        console.log("===========================");
        
        const bounties = [
            {
                title: "Smart Contract Gas Optimization Contest",
                description: "Optimize existing smart contracts to reduce gas consumption by at least 20%",
                type: 0, // INDIVIDUAL
                reward: ethers.parseEther("5"),
                deadline: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
                skills: ["solidity", "gas-optimization", "smart-contracts"],
                maxParticipants: 10,
                sponsor: user1
            },
            {
                title: "Avalanche Documentation Translation",
                description: "Translate core Avalanche documentation to multiple languages",
                type: 1, // TEAM
                reward: ethers.parseEther("3"),
                deadline: Math.floor(Date.now() / 1000) + (21 * 24 * 60 * 60), // 21 days
                skills: ["documentation", "translation", "technical-writing"],
                maxParticipants: 5,
                sponsor: user2
            },
            {
                title: "DeFi Integration Hackathon",
                description: "Build innovative DeFi application integrating multiple Avalanche protocols",
                type: 2, // HACKATHON
                reward: ethers.parseEther("10"),
                deadline: Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60), // 14 days
                skills: ["solidity", "defi", "frontend", "integration"],
                maxParticipants: 20,
                sponsor: owner
            }
        ];

        for (let i = 0; i < bounties.length; i++) {
            const bounty = bounties[i];
            try {
                const tx = await codeStakeDAO.connect(bounty.sponsor).createBounty(
                    bounty.title,
                    bounty.description,
                    bounty.type,
                    bounty.deadline,
                    bounty.skills,
                    bounty.maxParticipants,
                    { value: bounty.reward }
                );
                await tx.wait();
                console.log(`✅ Created Bounty ${i + 1}: ${bounty.title}`);
                console.log(`   Reward: ${ethers.formatEther(bounty.reward)} AVAX, Max Participants: ${bounty.maxParticipants}`);
            } catch (error) {
                console.log(`⚠️  Failed to create bounty ${bounty.title}: ${error.message}`);
            }
        }

        // 6. Treasury Management Demo
        console.log("\n💎 Treasury Management:");
        console.log("======================");
        
        // Fund treasury from multiple sources
        const fundingAmounts = [
            { funder: user1, amount: ethers.parseEther("2") },
            { funder: user2, amount: ethers.parseEther("1.5") },
            { funder: developer1, amount: ethers.parseEther("0.5") }
        ];

        for (const funding of fundingAmounts) {
            try {
                const tx = await codeStakeDAO.connect(funding.funder).fundTreasury({ 
                    value: funding.amount 
                });
                await tx.wait();
                console.log(`✅ ${funding.funder.address.slice(0, 8)}... funded treasury with ${ethers.formatEther(funding.amount)} AVAX`);
            } catch (error) {
                console.log(`⚠️  Treasury funding failed: ${error.message}`);
            }
        }

        // Display updated treasury balance
        const updatedTreasuryInfo = await codeStakeDAO.getTreasuryInfo();
        console.log(`📈 Updated Treasury Balance: ${ethers.formatEther(updatedTreasuryInfo.balance)} AVAX`);

        // 7. Governance Proposal Demo (if staking contract is available)
        if (stakingContract) {
            console.log("\n🏛️  Governance Proposal Demo:");
            console.log("============================");

            try {
                // User1 stakes enough to create proposals
                const stakeAmount = ethers.parseEther("1000");
                const stakeTx = await stakingContract.connect(user1).stake(7 * 24 * 60 * 60, { 
                    value: stakeAmount 
                });
                await stakeTx.wait();
                console.log(`✅ User1 staked ${ethers.formatEther(stakeAmount)} AVAX`);

                // Create a governance proposal
                const proposalData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["string", "uint256"],
                    ["votingPeriod", 14 * 24 * 60 * 60] // Change voting period to 14 days
                );

                const proposalTx = await codeStakeDAO.connect(user1).createProposal(
                    0, // PARAMETER_CHANGE
                    "Extend Voting Period",
                    "Proposal to extend the voting period from 7 days to 14 days to allow more community participation",
                    proposalData,
                    ["governance", "voting", "community"]
                );
                await proposalTx.wait();
                console.log("✅ Governance proposal created");

                // Get voting weight
                const votingWeight = await codeStakeDAO.getVotingWeight(user1.address);
                console.log(`📊 User1 voting weight: ${votingWeight.toString()}`);

            } catch (error) {
                console.log(`⚠️  Governance demo failed: ${error.message}`);
            }
        }

        // 8. AI Challenge Completion Demo
        console.log("\n🎯 AI Challenge Completion Demo:");
        console.log("===============================");

        try {
            // Developer1 completes a challenge
            const challengeId = 1;
            const proofData = ethers.hexlify(ethers.toUtf8Bytes("Completed challenge with optimal solution"));
            const aiSignature = ethers.hexlify(ethers.randomBytes(64)); // Mock AI signature

            const completeTx = await codeStakeDAO.connect(developer1).completeAIChallenge(
                challengeId,
                proofData,
                aiSignature
            );
            await completeTx.wait();
            console.log(`✅ Developer1 completed challenge ${challengeId}`);

            // Check completion status
            const completed = await codeStakeDAO.challengeCompletions(developer1.address, challengeId);
            console.log(`✅ Challenge completion confirmed: ${completed}`);

        } catch (error) {
            console.log(`⚠️  Challenge completion failed: ${error.message}`);
        }

        // 9. Display Active Proposals
        console.log("\n📋 Active Proposals:");
        console.log("==================");

        try {
            const activeProposals = await codeStakeDAO.getActiveProposals();
            console.log(`Active proposals count: ${activeProposals.length}`);

            for (let i = 0; i < activeProposals.length; i++) {
                const proposalId = activeProposals[i];
                const proposal = await codeStakeDAO.getProposal(proposalId);
                console.log(`Proposal ${proposalId}: ${proposal.title}`);
                console.log(`  Proposer: ${proposal.proposer}`);
                console.log(`  Votes For: ${proposal.votesFor.toString()}`);
                console.log(`  Votes Against: ${proposal.votesAgainst.toString()}`);
                console.log(`  Status: ${proposal.executed ? 'Executed' : 'Pending'}`);
            }
        } catch (error) {
            console.log(`⚠️  Failed to fetch active proposals: ${error.message}`);
        }

        // 10. Final Status Display
        console.log("\n🎉 Final Status Summary:");
        console.log("=======================");
        
        const finalTreasuryInfo = await codeStakeDAO.getTreasuryInfo();
        console.log(`💰 Final Treasury Balance: ${ethers.formatEther(finalTreasuryInfo.balance)} AVAX`);

        // Check AI challenges
        try {
            const challenge1 = await codeStakeDAO.getAIChallenge(1);
            console.log(`🤖 AI Challenge 1 completions: ${challenge1.completionCount.toString()}`);
        } catch (error) {
            console.log("📊 No AI challenges found");
        }

        // Check developer profiles
        for (const dev of developers) {
            try {
                const profile = await codeStakeDAO.getDeveloperProfile(dev.address);
                console.log(`👨‍💻 ${profile.githubUsername}: Karma ${profile.karmaPoints}, Challenges ${profile.completedChallenges.length}`);
            } catch (error) {
                // Developer not found
            }
        }

        console.log("\n✅ CodeStake DAO interaction demo completed successfully!");

    } catch (error) {
        console.error("❌ Demo failed:", error);
        throw error;
    }
}

// Run the interaction demo
main()
    .then(() => {
        console.log("\n🏁 All interactions completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("💥 Interaction demo failed:", error);
        process.exit(1);
    });

module.exports = main;
