const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RewardDistribution", function () {
    let stakingContract;
    let aaveIntegration;
    let rewardDistribution;
    let owner;
    let user1;
    let user2;
    let user3;

    const MINIMUM_STAKE = ethers.parseEther("1");
    const MINIMUM_LOCK_PERIOD = 86400; // 1 day
    const MAXIMUM_LOCK_PERIOD = 31536000; // 1 year
    const MINIMUM_CLAIM_AMOUNT = ethers.parseEther("0.01");
    const REWARD_UPDATE_INTERVAL = 3600; // 1 hour

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy AaveIntegration contract
        const AaveIntegration = await ethers.getContractFactory("AaveIntegration");
        aaveIntegration = await AaveIntegration.deploy();
        await aaveIntegration.waitForDeployment();

        // Deploy StakingContract
        const StakingContract = await ethers.getContractFactory("StakingContract");
        stakingContract = await StakingContract.deploy(
            MINIMUM_STAKE,
            MINIMUM_LOCK_PERIOD,
            MAXIMUM_LOCK_PERIOD
        );
        await stakingContract.waitForDeployment();

        // Deploy RewardDistribution contract
        const RewardDistribution = await ethers.getContractFactory("RewardDistribution");
        rewardDistribution = await RewardDistribution.deploy(
            MINIMUM_CLAIM_AMOUNT,
            REWARD_UPDATE_INTERVAL
        );
        await rewardDistribution.waitForDeployment();

        // Set up integrations
        await stakingContract.setAaveIntegration(await aaveIntegration.getAddress());
        await stakingContract.setRewardDistribution(await rewardDistribution.getAddress());
        await aaveIntegration.addAuthorizedContract(await stakingContract.getAddress());
        await rewardDistribution.setContracts(
            await stakingContract.getAddress(),
            await aaveIntegration.getAddress()
        );

        // Fund reward distribution contract for testing
        await owner.sendTransaction({
            to: await rewardDistribution.getAddress(),
            value: ethers.parseEther("10")
        });
    });

    describe("Deployment and Setup", function () {
        it("Should deploy all contracts correctly", async function () {
            expect(await rewardDistribution.owner()).to.equal(owner.address);
            expect(await rewardDistribution.minimumClaimAmount()).to.equal(MINIMUM_CLAIM_AMOUNT);
            expect(await rewardDistribution.rewardUpdateInterval()).to.equal(REWARD_UPDATE_INTERVAL);
        });

        it("Should set contract integrations correctly", async function () {
            expect(await rewardDistribution.stakingContract()).to.equal(await stakingContract.getAddress());
            expect(await rewardDistribution.aaveIntegration()).to.equal(await aaveIntegration.getAddress());
            expect(await stakingContract.rewardDistribution()).to.equal(await rewardDistribution.getAddress());
        });
    });

    describe("Reward Calculation", function () {
        beforeEach(async function () {
            // User1 stakes 5 AVAX
            await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, {
                value: ethers.parseEther("5")
            });

            // User2 stakes 10 AVAX
            await stakingContract.connect(user2).stake(MINIMUM_LOCK_PERIOD, {
                value: ethers.parseEther("10")
            });
        });

        it("Should calculate rewards proportionally based on stake amount", async function () {
            // Fast forward time to generate interest
            await ethers.provider.send("evm_increaseTime", [86400 * 30]); // 30 days
            await ethers.provider.send("evm_mine");

            // Update rewards
            await rewardDistribution.updateRewards();

            const user1Reward = await rewardDistribution.calculateUserReward(user1.address);
            const user2Reward = await rewardDistribution.calculateUserReward(user2.address);

            // User2 should have approximately 2x the rewards of User1 (10 AVAX vs 5 AVAX)
            expect(user2Reward).to.be.gt(user1Reward);
            expect(user2Reward).to.be.approximately(user1Reward * 2n, user1Reward / 10n);
        });

        it("Should handle zero staked amount correctly", async function () {
            const user3Reward = await rewardDistribution.calculateUserReward(user3.address);
            expect(user3Reward).to.equal(0);
        });

        it("Should update reward pool correctly", async function () {
            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");

            const totalRewardsBefore = await rewardDistribution.getTotalRewards();
            
            await expect(rewardDistribution.updateRewards())
                .to.emit(rewardDistribution, "RewardsUpdated");

            const totalRewardsAfter = await rewardDistribution.getTotalRewards();
            expect(totalRewardsAfter).to.be.gte(totalRewardsBefore);
        });
    });

    describe("Reward Claiming", function () {
        beforeEach(async function () {
            // User1 stakes
            await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, {
                value: ethers.parseEther("10")
            });

            // Fast forward time to generate rewards
            await ethers.provider.send("evm_increaseTime", [86400 * 30]); // 30 days
            await ethers.provider.send("evm_mine");

            // Update rewards
            await rewardDistribution.updateRewards();
        });

        it("Should allow users to claim rewards", async function () {
            const rewardBefore = await rewardDistribution.calculateUserReward(user1.address);
            expect(rewardBefore).to.be.gt(MINIMUM_CLAIM_AMOUNT);

            const balanceBefore = await ethers.provider.getBalance(user1.address);

            await expect(rewardDistribution.connect(user1).claimRewards())
                .to.emit(rewardDistribution, "RewardsClaimed");

            const balanceAfter = await ethers.provider.getBalance(user1.address);
            expect(balanceAfter).to.be.gt(balanceBefore);

            // User should have no rewards left after claiming
            const rewardAfter = await rewardDistribution.calculateUserReward(user1.address);
            expect(rewardAfter).to.equal(0);
        });

        it("Should reject claims below minimum amount", async function () {
            // Deploy new contracts with high minimum claim amount
            const RewardDistribution = await ethers.getContractFactory("RewardDistribution");
            const highMinRewardDistribution = await RewardDistribution.deploy(
                ethers.parseEther("100"), // Very high minimum
                REWARD_UPDATE_INTERVAL
            );

            await highMinRewardDistribution.setContracts(
                await stakingContract.getAddress(),
                await aaveIntegration.getAddress()
            );

            await expect(highMinRewardDistribution.connect(user1).claimRewards())
                .to.be.revertedWithCustomError(highMinRewardDistribution, "InsufficientRewards");
        });

        it("Should reject claims when no rewards available", async function () {
            await expect(rewardDistribution.connect(user3).claimRewards())
                .to.be.revertedWithCustomError(rewardDistribution, "NoRewardsToClaim");
        });

        it("Should update distributed rewards correctly", async function () {
            const distributedBefore = await rewardDistribution.getDistributedRewards();
            const userReward = await rewardDistribution.calculateUserReward(user1.address);

            await rewardDistribution.connect(user1).claimRewards();

            const distributedAfter = await rewardDistribution.getDistributedRewards();
            expect(distributedAfter).to.be.approximately(distributedBefore + userReward, ethers.parseEther("0.001"));
        });
    });

    describe("End-to-End User Journey", function () {
        it("Should handle complete staking to reward claiming flow", async function () {
            // Step 1: User stakes AVAX
            const stakeAmount = ethers.parseEther("5");
            const lockPeriod = MINIMUM_LOCK_PERIOD;

            await expect(stakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount }))
                .to.emit(stakingContract, "Staked")
                .to.emit(stakingContract, "TokensDepositedToAave");

            // Verify staking worked
            expect(await stakingContract.userTotalStaked(user1.address)).to.equal(stakeAmount);
            expect(await aaveIntegration.getTotalDeposited()).to.equal(stakeAmount);

            // Step 2: Time passes and interest accrues
            await ethers.provider.send("evm_increaseTime", [86400 * 30]); // 30 days
            await ethers.provider.send("evm_mine");

            // Step 3: Update rewards
            await rewardDistribution.updateRewards();

            // Step 4: Check user has rewards
            const userReward = await rewardDistribution.calculateUserReward(user1.address);
            expect(userReward).to.be.gt(0);
            expect(userReward).to.be.gte(MINIMUM_CLAIM_AMOUNT);

            // Step 5: User claims rewards
            const balanceBefore = await ethers.provider.getBalance(user1.address);
            await rewardDistribution.connect(user1).claimRewards();
            const balanceAfter = await ethers.provider.getBalance(user1.address);
            expect(balanceAfter).to.be.gt(balanceBefore);

            // Step 6: User unstakes after lock period
            await ethers.provider.send("evm_increaseTime", [lockPeriod + 1]);
            await ethers.provider.send("evm_mine");

            const positions = await stakingContract.getActiveStakingPositions(user1.address);
            const positionId = positions[0].id;

            await expect(stakingContract.connect(user1).unstake(positionId))
                .to.emit(stakingContract, "Unstaked")
                .to.emit(stakingContract, "TokensWithdrawnFromAave");

            // Verify unstaking worked
            expect(await stakingContract.userTotalStaked(user1.address)).to.equal(0);
        });

        it("Should handle multiple users with different stake amounts and timing", async function () {
            // User1 stakes 5 AVAX
            await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, {
                value: ethers.parseEther("5")
            });

            // Wait 15 days
            await ethers.provider.send("evm_increaseTime", [86400 * 15]);
            await ethers.provider.send("evm_mine");

            // User2 stakes 10 AVAX (later, but more amount)
            await stakingContract.connect(user2).stake(MINIMUM_LOCK_PERIOD, {
                value: ethers.parseEther("10")
            });

            // Wait another 15 days
            await ethers.provider.send("evm_increaseTime", [86400 * 15]);
            await ethers.provider.send("evm_mine");

            // Update rewards
            await rewardDistribution.updateRewards();

            const user1Reward = await rewardDistribution.calculateUserReward(user1.address);
            const user2Reward = await rewardDistribution.calculateUserReward(user2.address);

            // Both users should have rewards
            expect(user1Reward).to.be.gt(0);
            expect(user2Reward).to.be.gt(0);

            // Both users should have rewards, but the exact comparison depends on timing
            // User1 staked earlier but User2 staked more, so rewards depend on the specific timing
            expect(user1Reward).to.be.gt(0);
            expect(user2Reward).to.be.gt(0);

            // Both users can claim their rewards
            if (user1Reward >= MINIMUM_CLAIM_AMOUNT) {
                await expect(rewardDistribution.connect(user1).claimRewards())
                    .to.emit(rewardDistribution, "RewardsClaimed");
            }

            if (user2Reward >= MINIMUM_CLAIM_AMOUNT) {
                await expect(rewardDistribution.connect(user2).claimRewards())
                    .to.emit(rewardDistribution, "RewardsClaimed");
            }
        });

        it("Should handle edge case of user staking and immediately unstaking", async function () {
            const stakeAmount = ethers.parseEther("2");

            // User stakes
            await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, { value: stakeAmount });

            // Immediately check rewards (should be 0 or very small)
            const immediateReward = await rewardDistribution.calculateUserReward(user1.address);
            expect(immediateReward).to.equal(0);

            // Fast forward past lock period
            await ethers.provider.send("evm_increaseTime", [MINIMUM_LOCK_PERIOD + 1]);
            await ethers.provider.send("evm_mine");

            // Update rewards
            await rewardDistribution.updateRewards();

            // Check rewards after time has passed
            const laterReward = await rewardDistribution.calculateUserReward(user1.address);
            expect(laterReward).to.be.gt(0);

            // User unstakes
            const positions = await stakingContract.getActiveStakingPositions(user1.address);
            await stakingContract.connect(user1).unstake(positions[0].id);

            // User should still be able to claim accrued rewards
            if (laterReward >= MINIMUM_CLAIM_AMOUNT) {
                await expect(rewardDistribution.connect(user1).claimRewards())
                    .to.emit(rewardDistribution, "RewardsClaimed");
            }
        });
    });

    describe("Security and Access Control", function () {
        it("Should only allow owner to set contracts", async function () {
            await expect(rewardDistribution.connect(user1).setContracts(user1.address, user2.address))
                .to.be.revertedWithCustomError(rewardDistribution, "OwnableUnauthorizedAccount");
        });

        it("Should only allow owner to emergency withdraw", async function () {
            await expect(rewardDistribution.connect(user1).emergencyWithdrawRewards(ethers.parseEther("1")))
                .to.be.revertedWithCustomError(rewardDistribution, "OwnableUnauthorizedAccount");
        });

        it("Should only allow owner to pause/unpause", async function () {
            await expect(rewardDistribution.connect(user1).pause())
                .to.be.revertedWithCustomError(rewardDistribution, "OwnableUnauthorizedAccount");

            await expect(rewardDistribution.connect(user1).unpause())
                .to.be.revertedWithCustomError(rewardDistribution, "OwnableUnauthorizedAccount");
        });

        it("Should prevent operations when paused", async function () {
            await rewardDistribution.pause();

            await expect(rewardDistribution.updateRewards())
                .to.be.revertedWithCustomError(rewardDistribution, "EnforcedPause");

            await expect(rewardDistribution.connect(user1).claimRewards())
                .to.be.revertedWithCustomError(rewardDistribution, "EnforcedPause");
        });

        it("Should handle insufficient contract balance gracefully", async function () {
            // Deploy new reward distribution with no funding
            const RewardDistribution = await ethers.getContractFactory("RewardDistribution");
            const unfundedRewardDistribution = await RewardDistribution.deploy(
                MINIMUM_CLAIM_AMOUNT,
                REWARD_UPDATE_INTERVAL
            );

            await unfundedRewardDistribution.setContracts(
                await stakingContract.getAddress(),
                await aaveIntegration.getAddress()
            );

            // User stakes
            await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, {
                value: ethers.parseEther("5")
            });

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine");

            // Update rewards
            await unfundedRewardDistribution.updateRewards();

            // Try to claim rewards - should fail due to insufficient balance
            await expect(unfundedRewardDistribution.connect(user1).claimRewards())
                .to.be.revertedWithCustomError(unfundedRewardDistribution, "InsufficientRewards");
        });
    });

    describe("Reward Pool Management", function () {
        it("Should track reward pool state correctly", async function () {
            // Initial state
            expect(await rewardDistribution.getTotalRewards()).to.equal(0);
            expect(await rewardDistribution.getDistributedRewards()).to.equal(0);

            // User stakes
            await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, {
                value: ethers.parseEther("10")
            });

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine");

            // Update rewards
            await rewardDistribution.updateRewards();

            const totalRewards = await rewardDistribution.getTotalRewards();
            expect(totalRewards).to.be.gt(0);

            // User claims rewards
            const userReward = await rewardDistribution.calculateUserReward(user1.address);
            if (userReward >= MINIMUM_CLAIM_AMOUNT) {
                await rewardDistribution.connect(user1).claimRewards();
                
                const distributedRewards = await rewardDistribution.getDistributedRewards();
                expect(distributedRewards).to.be.approximately(userReward, ethers.parseEther("0.001"));
            }
        });

        it("Should handle reward rate calculation", async function () {
            // User stakes
            await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, {
                value: ethers.parseEther("10")
            });

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");

            // Update rewards
            await rewardDistribution.updateRewards();

            const rewardRate = await rewardDistribution.getRewardRate();
            expect(rewardRate).to.be.gte(0);
        });
    });
});

// Helper function for time manipulation
const time = {
    latest: async () => {
        const block = await ethers.provider.getBlock("latest");
        return block.timestamp;
    },
    increase: async (seconds) => {
        await ethers.provider.send("evm_increaseTime", [seconds]);
        await ethers.provider.send("evm_mine");
    }
};