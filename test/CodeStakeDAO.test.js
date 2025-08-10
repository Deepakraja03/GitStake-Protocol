const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("CodeStakeDAO", function () {
    let codeStakeDAO;
    let stakingContract;
    let rewardDistribution;
    let aaveIntegration;
    let owner;
    let developer1;
    let developer2;
    let user1;
    let user2;

    const ONE_DAY = 24 * 60 * 60;
    const ONE_WEEK = 7 * ONE_DAY;
    const PROPOSAL_THRESHOLD = ethers.parseEther("1000");
    const MIN_STAKE = ethers.parseEther("0.1");

    beforeEach(async function () {
        [owner, developer1, developer2, user1, user2] = await ethers.getSigners();

        // Deploy dependencies
        const StakingContract = await ethers.getContractFactory("StakingContract");
        stakingContract = await StakingContract.deploy(
            MIN_STAKE,
            ONE_DAY,
            365 * ONE_DAY
        );
        await stakingContract.waitForDeployment();

        const RewardDistribution = await ethers.getContractFactory("RewardDistribution");
        rewardDistribution = await RewardDistribution.deploy(
            ethers.parseEther("0.01"),
            3600
        );
        await rewardDistribution.waitForDeployment();

        const AaveIntegration = await ethers.getContractFactory("AaveIntegration");
        aaveIntegration = await AaveIntegration.deploy();
        await aaveIntegration.waitForDeployment();

        // Deploy CodeStakeDAO
        const CodeStakeDAO = await ethers.getContractFactory("CodeStakeDAO");
        codeStakeDAO = await CodeStakeDAO.deploy(
            await stakingContract.getAddress(),
            await rewardDistribution.getAddress(),
            await aaveIntegration.getAddress()
        );
        await codeStakeDAO.waitForDeployment();

        // Fund treasury
        await codeStakeDAO.connect(owner).fundTreasury({ value: ethers.parseEther("10") });
    });

    describe("Deployment", function () {
        it("Should set the correct initial parameters", async function () {
            expect(await codeStakeDAO.votingDelay()).to.equal(ONE_DAY);
            expect(await codeStakeDAO.votingPeriod()).to.equal(ONE_WEEK);
            expect(await codeStakeDAO.proposalThreshold()).to.equal(PROPOSAL_THRESHOLD);
            expect(await codeStakeDAO.quorumThreshold()).to.equal(5000);
            expect(await codeStakeDAO.passThreshold()).to.equal(5100);
        });

        it("Should initialize treasury allocation correctly", async function () {
            const treasuryInfo = await codeStakeDAO.getTreasuryInfo();
            expect(treasuryInfo.allocation.rewardPoolPercentage).to.equal(4000);
            expect(treasuryInfo.allocation.developmentFundPercentage).to.equal(2000);
            expect(treasuryInfo.allocation.aiInfrastructurePercentage).to.equal(2000);
            expect(treasuryInfo.allocation.communityIncentivesPercentage).to.equal(1500);
            expect(treasuryInfo.allocation.reservePercentage).to.equal(500);
        });

        it("Should set AI usage budgets", async function () {
            expect(await codeStakeDAO.aiUsageBudget()).to.equal(ethers.parseEther("10"));
            expect(await codeStakeDAO.webSearchBudget()).to.equal(ethers.parseEther("5"));
        });
    });

    describe("Treasury Management", function () {
        it("Should allow funding the treasury", async function () {
            const initialBalance = (await codeStakeDAO.getTreasuryInfo()).balance;
            const fundAmount = ethers.parseEther("5");

            await expect(codeStakeDAO.connect(user1).fundTreasury({ value: fundAmount }))
                .to.emit(codeStakeDAO, "TreasuryFunded")
                .withArgs(fundAmount, user1.address);

            const newBalance = (await codeStakeDAO.getTreasuryInfo()).balance;
            expect(newBalance - initialBalance).to.equal(fundAmount);
        });

        it("Should allow owner to withdraw from treasury", async function () {
            const withdrawAmount = ethers.parseEther("2");
            
            await expect(codeStakeDAO.connect(owner).withdrawFromTreasury(
                withdrawAmount,
                user1.address,
                "Test withdrawal"
            ))
                .to.emit(codeStakeDAO, "TreasuryWithdrawal")
                .withArgs(withdrawAmount, user1.address, "Test withdrawal");
        });

        it("Should not allow non-owner to withdraw from treasury", async function () {
            const withdrawAmount = ethers.parseEther("2");
            
            await expect(codeStakeDAO.connect(user1).withdrawFromTreasury(
                withdrawAmount,
                user1.address,
                "Unauthorized withdrawal"
            )).to.be.revertedWithCustomError(codeStakeDAO, "OwnableUnauthorizedAccount");
        });
    });

    describe("Developer Verification", function () {
        it("Should allow owner to verify developers", async function () {
            const githubUsername = "test_developer_1";
            const githubProof = "0x1234567890abcdef";

            await expect(codeStakeDAO.connect(owner).verifyDeveloper(
                developer1.address,
                githubUsername,
                githubProof
            ))
                .to.emit(codeStakeDAO, "DeveloperVerified")
                .withArgs(developer1.address, githubUsername);

            const profile = await codeStakeDAO.getDeveloperProfile(developer1.address);
            expect(profile.githubUsername).to.equal(githubUsername);
            expect(profile.verified).to.be.true;
            expect(profile.karmaPoints).to.equal(100);
        });

        it("Should not allow non-authorized users to verify developers", async function () {
            await expect(codeStakeDAO.connect(user1).verifyDeveloper(
                developer1.address,
                "test_developer",
                "0x1234"
            )).to.be.revertedWith("Not authorized to verify");
        });
    });

    describe("GitHub Repository Management", function () {
        it("Should allow owner to add GitHub repositories", async function () {
            const repoUrl = "https://github.com/test/repo";
            const weight = 100;
            const contributionTypes = ["commits", "pull_requests"];

            // Need to call from owner() function, not owner variable
            await expect(codeStakeDAO.connect(owner).addGitHubRepo(
                repoUrl,
                owner.address, // Use owner address instead of developer1
                weight,
                contributionTypes
            ))
                .to.emit(codeStakeDAO, "GitHubRepoAdded")
                .withArgs(repoUrl, owner.address, weight);

            const repo = await codeStakeDAO.githubRepos(repoUrl);
            expect(repo.owner).to.equal(owner.address);
            expect(repo.weight).to.equal(weight);
            expect(repo.active).to.be.true;
        });

        it("Should allow owner to remove GitHub repositories", async function () {
            const repoUrl = "https://github.com/test/repo";
            
            // First add the repo
            await codeStakeDAO.connect(owner).addGitHubRepo(
                repoUrl,
                developer1.address,
                100,
                ["commits"]
            );

            // Then remove it
            await expect(codeStakeDAO.connect(owner).removeGitHubRepo(repoUrl))
                .to.emit(codeStakeDAO, "GitHubRepoRemoved")
                .withArgs(repoUrl);

            const repo = await codeStakeDAO.githubRepos(repoUrl);
            expect(repo.active).to.be.false;
        });
    });

    describe("AI Challenges", function () {
        beforeEach(async function () {
            // Verify developer first
            await codeStakeDAO.connect(owner).verifyDeveloper(
                developer1.address,
                "test_dev1",
                "0x1234"
            );
        });

        it("Should allow owner to create AI challenges", async function () {
            const title = "Test Challenge";
            const description = "A test coding challenge";
            const difficulty = 5;
            const rewardMultiplier = 15000;
            const skills = ["javascript", "testing"];
            const timeLimit = ONE_DAY * 3;

            await expect(codeStakeDAO.connect(owner).createAIChallenge(
                title,
                description,
                difficulty,
                rewardMultiplier,
                skills,
                timeLimit
            ))
                .to.emit(codeStakeDAO, "AIChallengeCreated")
                .withArgs(1, title, difficulty, rewardMultiplier);

            const challenge = await codeStakeDAO.getAIChallenge(1);
            expect(challenge.title).to.equal(title);
            expect(challenge.difficulty).to.equal(difficulty);
            expect(challenge.active).to.be.true;
        });

        it("Should allow verified developers to complete challenges", async function () {
            // Create challenge first
            await codeStakeDAO.connect(owner).createAIChallenge(
                "Test Challenge",
                "Description",
                5,
                15000,
                ["javascript"],
                ONE_DAY * 3
            );

            const challengeId = 1;
            const proofData = "0xabcdef";
            const aiSignature = "0x123456";

            await expect(codeStakeDAO.connect(developer1).completeAIChallenge(
                challengeId,
                proofData,
                aiSignature
            ))
                .to.emit(codeStakeDAO, "ChallengeCompleted");

            expect(await codeStakeDAO.challengeCompletions(developer1.address, challengeId))
                .to.be.true;
        });

        it("Should not allow unverified developers to complete challenges", async function () {
            // Create challenge first
            await codeStakeDAO.connect(owner).createAIChallenge(
                "Test Challenge",
                "Description",
                5,
                15000,
                ["javascript"],
                ONE_DAY * 3
            );

            const proofData = ethers.hexlify(ethers.toUtf8Bytes("proof"));
            const signature = ethers.hexlify(ethers.toUtf8Bytes("signature"));

            await expect(codeStakeDAO.connect(user1).completeAIChallenge(
                1,
                proofData,
                signature
            )).to.be.revertedWith("Not verified developer");
        });

        it("Should prevent completing the same challenge twice", async function () {
            // Create and complete challenge
            await codeStakeDAO.connect(owner).createAIChallenge(
                "Test Challenge",
                "Description",
                5,
                15000,
                ["javascript"],
                ONE_DAY * 3
            );

            const proofData1 = ethers.hexlify(ethers.toUtf8Bytes("proof"));
            const signature1 = ethers.hexlify(ethers.toUtf8Bytes("signature"));
            
            await codeStakeDAO.connect(developer1).completeAIChallenge(
                1,
                proofData1,
                signature1
            );

            // Try to complete again
            const proofData2 = ethers.hexlify(ethers.toUtf8Bytes("proof2"));
            const signature2 = ethers.hexlify(ethers.toUtf8Bytes("signature2"));
            
            await expect(codeStakeDAO.connect(developer1).completeAIChallenge(
                1,
                proofData2,
                signature2
            )).to.be.revertedWith("Already completed");
        });
    });

    describe("Bounty System", function () {
        it("Should allow creating bounty programs", async function () {
            const title = "Test Bounty";
            const description = "A test bounty program";
            const bountyType = 0; // INDIVIDUAL
            const deadline = (await time.latest()) + ONE_WEEK;
            const skills = ["solidity", "testing"];
            const maxParticipants = 5;
            const reward = ethers.parseEther("1");

            await expect(codeStakeDAO.connect(user1).createBounty(
                title,
                description,
                bountyType,
                deadline,
                skills,
                maxParticipants,
                { value: reward }
            ))
                .to.emit(codeStakeDAO, "BountyCreated")
                .withArgs(1, title, reward, user1.address);

            const bounty = await codeStakeDAO.bountyPrograms(1);
            expect(bounty.title).to.equal(title);
            expect(bounty.reward).to.equal(reward);
            expect(bounty.sponsor).to.equal(user1.address);
            expect(bounty.active).to.be.true;
        });

        it("Should require bounty reward to be greater than 0", async function () {
            await expect(codeStakeDAO.connect(user1).createBounty(
                "Test Bounty",
                "Description",
                0,
                (await time.latest()) + ONE_WEEK,
                ["solidity"],
                5,
                { value: 0 }
            )).to.be.revertedWith("Bounty reward required");
        });
    });

    describe("Proposal System", function () {
        beforeEach(async function () {
            // Stake enough tokens to meet proposal threshold
            await stakingContract.connect(user1).stake(ONE_WEEK, { 
                value: PROPOSAL_THRESHOLD 
            });
        });

        it("Should allow stakers to create proposals", async function () {
            const title = "Test Proposal";
            const description = "A test governance proposal";
            const proposalType = 0; // PARAMETER_CHANGE
            const executionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["string", "uint256"],
                ["votingPeriod", ONE_WEEK * 2]
            );

            await expect(codeStakeDAO.connect(user1).createProposal(
                proposalType,
                title,
                description,
                executionData,
                []
            ))
                .to.emit(codeStakeDAO, "ProposalCreated")
                .withArgs(1, user1.address, proposalType, title, anyValue, anyValue);

            const proposal = await codeStakeDAO.getProposal(1);
            expect(proposal.title).to.equal(title);
            expect(proposal.proposer).to.equal(user1.address);
        });

        it("Should not allow non-stakers to create proposals", async function () {
            await expect(codeStakeDAO.connect(user2).createProposal(
                0,
                "Test",
                "Description",
                "0x",
                []
            )).to.be.revertedWith("Insufficient stake");
        });

        it("Should allow voting on proposals", async function () {
            // Create proposal
            const proposalTx = await codeStakeDAO.connect(user1).createProposal(
                0, // PARAMETER_CHANGE
                "Test Proposal",
                "Description",
                "0x",
                []
            );
            await proposalTx.wait();

            // Fast forward past voting delay
            await time.increase(ONE_DAY + 1);

            // Vote
            await expect(codeStakeDAO.connect(user1).castVote(1, true, "I support this"))
                .to.emit(codeStakeDAO, "VoteCast")
                .withArgs(1, user1.address, true, anyValue, "I support this");
        });

        it("Should calculate voting weight correctly", async function () {
            const votingWeight = await codeStakeDAO.getVotingWeight(user1.address);
            // Should be 1000 (from 1000 AVAX staked) + any reputation bonus
            expect(votingWeight).to.be.gte(1000);
        });
    });

    describe("Governance Parameters", function () {
        it("Should allow owner to update DAO parameters", async function () {
            const newVotingPeriod = ONE_WEEK * 2;
            
            await codeStakeDAO.connect(owner).updateDAOParameters(
                ONE_DAY, // votingDelay
                newVotingPeriod, // votingPeriod
                ONE_DAY * 2, // executionDelay
                PROPOSAL_THRESHOLD, // proposalThreshold
                5000, // quorumThreshold
                5100 // passThreshold
            );

            expect(await codeStakeDAO.votingPeriod()).to.equal(newVotingPeriod);
        });

        it("Should not allow non-owner to update parameters", async function () {
            await expect(codeStakeDAO.connect(user1).updateDAOParameters(
                ONE_DAY,
                ONE_WEEK,
                ONE_DAY * 2,
                PROPOSAL_THRESHOLD,
                5000,
                5100
            )).to.be.revertedWithCustomError(codeStakeDAO, "OwnableUnauthorizedAccount");
        });
    });

    describe("Emergency Functions", function () {
        it("Should allow owner to pause and unpause", async function () {
            await codeStakeDAO.connect(owner).pause();
            expect(await codeStakeDAO.paused()).to.be.true;

            await codeStakeDAO.connect(owner).unpause();
            expect(await codeStakeDAO.paused()).to.be.false;
        });

        it("Should allow emergency withdrawal when paused", async function () {
            await codeStakeDAO.connect(owner).pause();
            
            const contractBalance = await ethers.provider.getBalance(await codeStakeDAO.getAddress());
            
            await expect(codeStakeDAO.connect(owner).emergencyWithdraw(contractBalance))
                .to.not.be.reverted;
        });

        it("Should not allow emergency withdrawal when not paused", async function () {
            const contractBalance = await ethers.provider.getBalance(await codeStakeDAO.getAddress());
            
            await expect(codeStakeDAO.connect(owner).emergencyWithdraw(contractBalance))
                .to.be.revertedWithCustomError(codeStakeDAO, "ExpectedPause");
        });
    });

    describe("Integration", function () {
        it("Should correctly reference other contracts", async function () {
            expect(await codeStakeDAO.stakingContract()).to.equal(await stakingContract.getAddress());
            expect(await codeStakeDAO.rewardDistribution()).to.equal(await rewardDistribution.getAddress());
            expect(await codeStakeDAO.aaveIntegration()).to.equal(await aaveIntegration.getAddress());
        });

        it("Should receive AVAX for treasury funding", async function () {
            const fundAmount = ethers.parseEther("1");
            
            await expect(
                user1.sendTransaction({
                    to: await codeStakeDAO.getAddress(),
                    value: fundAmount
                })
            ).to.emit(codeStakeDAO, "TreasuryFunded")
             .withArgs(fundAmount, user1.address);
        });
    });

    // Helper function for testing
    const anyValue = expect.anything;
});
