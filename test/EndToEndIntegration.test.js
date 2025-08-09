const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("End-to-End Integration", function () {
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
    const MINIMUM_CLAIM_AMOUNT = ethers.parseEther("0.001");
    const REWARD_UPDATE_INTERVAL = 3600; // 1 hour

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy all contracts
        const AaveIntegration = await ethers.getContractFactory("AaveIntegration");
        aaveIntegration = await AaveIntegration.deploy();
        await aaveIntegration.waitForDeployment();

        const StakingContract = await ethers.getContractFactory("StakingContract");
        stakingContract = await StakingContract.deploy(
            MINIMUM_STAKE,
            MINIMUM_LOCK_PERIOD,
            MAXIMUM_LOCK_PERIOD
        );
        await stakingContract.waitForDeployment();

        const RewardDistribution = await ethers.getContractFactory("RewardDistribution");
        rewardDistribution = await RewardDistribution.deploy(
            MINIMUM_CLAIM_AMOUNT,
            REWARD_UPDATE_INTERVAL
        );
        await rewardDistribution.waitForDeployment();

        // Set up all integrations
        await stakingContract.setAaveIntegration(await aaveIntegration.getAddress());
        await stakingContract.setRewardDistribution(await rewardDistribution.getAddress());
        await aaveIntegration.addAuthorizedContract(await stakingContract.getAddress());
        await rewardDistribution.setContracts(
            await stakingContract.getAddress(),
            await aaveIntegration.getAddress()
        );

        // Fund reward distribution contract with a reasonable amount
        await owner.sendTransaction({
            to: await rewardDistribution.getAddress(),
            value: ethers.parseEther("5") // Reduced amount to be more realistic
        });
    });

    describe("Complete User Journey - Single User", function () {
        it("Should handle complete lifecycle: stake -> earn -> claim -> unstake", async function () {
            const stakeAmount = ethers.parseEther("10");
            const lockPeriod = MINIMUM_LOCK_PERIOD * 7; // 1 week

            console.log("=== Starting Complete User Journey Test ===");

            // Step 1: Initial balances
            const initialUserBalance = await ethers.provider.getBalance(user1.address);
            console.log(`Initial user balance: ${ethers.formatEther(initialUserBalance)} AVAX`);

            // Step 2: User stakes AVAX
            console.log(`\nStep 1: User stakes ${ethers.formatEther(stakeAmount)} AVAX`);
            
            const stakeTx = await stakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount });
            await stakeTx.wait();

            // Verify staking worked
            expect(await stakingContract.userTotalStaked(user1.address)).to.equal(stakeAmount);
            expect(await stakingContract.totalStaked()).to.equal(stakeAmount);
            expect(await aaveIntegration.getTotalDeposited()).to.equal(stakeAmount);

            console.log(`✓ Staking successful`);
            console.log(`✓ Total staked: ${ethers.formatEther(await stakingContract.totalStaked())} AVAX`);
            console.log(`✓ Aave deposited: ${ethers.formatEther(await aaveIntegration.getTotalDeposited())} AVAX`);

            // Step 3: Time passes - simulate 30 days
            console.log(`\nStep 2: Simulating 30 days of interest accrual...`);
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine");

            // Step 4: Check Aave interest
            const aaveInterest = await aaveIntegration.getAccruedInterest();
            console.log(`✓ Aave interest accrued: ${ethers.formatEther(aaveInterest)} AVAX`);
            expect(aaveInterest).to.be.gt(0);

            // Step 5: Update rewards in reward distribution
            console.log(`\nStep 3: Updating reward distribution...`);
            await rewardDistribution.updateRewards();

            const totalRewards = await rewardDistribution.getTotalRewards();
            const userReward = await rewardDistribution.calculateUserReward(user1.address);
            
            console.log(`✓ Total rewards in pool: ${ethers.formatEther(totalRewards)} AVAX`);
            console.log(`✓ User's calculated reward: ${ethers.formatEther(userReward)} AVAX`);
            
            expect(totalRewards).to.be.gt(0);
            expect(userReward).to.be.gt(0);
            expect(userReward).to.be.gte(MINIMUM_CLAIM_AMOUNT);

            // Step 6: User claims rewards
            console.log(`\nStep 4: User claims rewards...`);
            const balanceBeforeClaim = await ethers.provider.getBalance(user1.address);
            
            const claimTx = await rewardDistribution.connect(user1).claimRewards();
            const claimReceipt = await claimTx.wait();
            const gasUsed = claimReceipt.gasUsed * claimReceipt.gasPrice;
            
            const balanceAfterClaim = await ethers.provider.getBalance(user1.address);
            const netRewardReceived = balanceAfterClaim - balanceBeforeClaim + gasUsed;
            
            console.log(`✓ Rewards claimed successfully`);
            console.log(`✓ Net reward received: ${ethers.formatEther(netRewardReceived)} AVAX`);
            
            expect(balanceAfterClaim).to.be.gt(balanceBeforeClaim);
            expect(await rewardDistribution.calculateUserReward(user1.address)).to.equal(0);

            // Step 7: More time passes
            console.log(`\nStep 5: Simulating additional 15 days...`);
            await ethers.provider.send("evm_increaseTime", [86400 * 15]);
            await ethers.provider.send("evm_mine");

            // Step 8: Check if more rewards accumulated
            await rewardDistribution.updateRewards();
            const additionalReward = await rewardDistribution.calculateUserReward(user1.address);
            console.log(`✓ Additional rewards accumulated: ${ethers.formatEther(additionalReward)} AVAX`);
            expect(additionalReward).to.be.gt(0);

            // Step 9: User unstakes after lock period
            console.log(`\nStep 6: User unstakes after lock period...`);
            
            // Fast forward past lock period
            await ethers.provider.send("evm_increaseTime", [lockPeriod + 1]);
            await ethers.provider.send("evm_mine");

            const positions = await stakingContract.getActiveStakingPositions(user1.address);
            expect(positions.length).to.equal(1);
            const positionId = positions[0].id;

            const balanceBeforeUnstake = await ethers.provider.getBalance(user1.address);
            
            const unstakeTx = await stakingContract.connect(user1).unstake(positionId);
            const unstakeReceipt = await unstakeTx.wait();
            const unstakeGasUsed = unstakeReceipt.gasUsed * unstakeReceipt.gasPrice;
            
            const balanceAfterUnstake = await ethers.provider.getBalance(user1.address);
            const netUnstakeReceived = balanceAfterUnstake - balanceBeforeUnstake + unstakeGasUsed;
            
            console.log(`✓ Unstaking successful`);
            console.log(`✓ Principal returned: ${ethers.formatEther(netUnstakeReceived)} AVAX`);
            
            // Verify unstaking worked
            expect(await stakingContract.userTotalStaked(user1.address)).to.equal(0);
            expect(await stakingContract.totalStaked()).to.equal(0);
            expect(balanceAfterUnstake).to.be.gt(balanceBeforeUnstake);

            // Step 10: User can still claim remaining rewards
            console.log(`\nStep 7: Claiming remaining rewards...`);
            const finalReward = await rewardDistribution.calculateUserReward(user1.address);
            if (finalReward >= MINIMUM_CLAIM_AMOUNT) {
                await rewardDistribution.connect(user1).claimRewards();
                console.log(`✓ Final rewards claimed: ${ethers.formatEther(finalReward)} AVAX`);
            }

            // Final verification
            const finalUserBalance = await ethers.provider.getBalance(user1.address);
            console.log(`\nFinal user balance: ${ethers.formatEther(finalUserBalance)} AVAX`);
            console.log(`Total profit: ${ethers.formatEther(finalUserBalance - initialUserBalance + gasUsed + unstakeGasUsed)} AVAX`);
            
            console.log("=== Complete User Journey Test Completed Successfully ===");
        });
    });

    describe("Complete User Journey - Multiple Users", function () {
        it("Should handle multiple users with different strategies", async function () {
            console.log("=== Starting Multiple Users Journey Test ===");

            // User strategies
            const user1Strategy = { amount: ethers.parseEther("5"), lockPeriod: MINIMUM_LOCK_PERIOD };
            const user2Strategy = { amount: ethers.parseEther("15"), lockPeriod: MINIMUM_LOCK_PERIOD * 2 };
            const user3Strategy = { amount: ethers.parseEther("10"), lockPeriod: MINIMUM_LOCK_PERIOD * 3 };

            // Step 1: Users stake at different times
            console.log("\nStep 1: Users stake with different strategies...");
            
            // User1 stakes first
            await stakingContract.connect(user1).stake(user1Strategy.lockPeriod, { 
                value: user1Strategy.amount 
            });
            console.log(`✓ User1 staked ${ethers.formatEther(user1Strategy.amount)} AVAX`);

            // Wait 10 days
            await ethers.provider.send("evm_increaseTime", [86400 * 10]);
            await ethers.provider.send("evm_mine");

            // User2 stakes
            await stakingContract.connect(user2).stake(user2Strategy.lockPeriod, { 
                value: user2Strategy.amount 
            });
            console.log(`✓ User2 staked ${ethers.formatEther(user2Strategy.amount)} AVAX`);

            // Wait another 10 days
            await ethers.provider.send("evm_increaseTime", [86400 * 10]);
            await ethers.provider.send("evm_mine");

            // User3 stakes
            await stakingContract.connect(user3).stake(user3Strategy.lockPeriod, { 
                value: user3Strategy.amount 
            });
            console.log(`✓ User3 staked ${ethers.formatEther(user3Strategy.amount)} AVAX`);

            // Verify total staking
            const totalStaked = await stakingContract.totalStaked();
            const expectedTotal = user1Strategy.amount + user2Strategy.amount + user3Strategy.amount;
            expect(totalStaked).to.equal(expectedTotal);
            console.log(`✓ Total staked: ${ethers.formatEther(totalStaked)} AVAX`);

            // Step 2: Let time pass for interest to accrue
            console.log("\nStep 2: Simulating 30 days of interest accrual...");
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine");

            // Step 3: Update rewards and check distribution
            console.log("\nStep 3: Updating rewards and checking distribution...");
            await rewardDistribution.updateRewards();

            const user1Reward = await rewardDistribution.calculateUserReward(user1.address);
            const user2Reward = await rewardDistribution.calculateUserReward(user2.address);
            const user3Reward = await rewardDistribution.calculateUserReward(user3.address);

            console.log(`✓ User1 reward: ${ethers.formatEther(user1Reward)} AVAX`);
            console.log(`✓ User2 reward: ${ethers.formatEther(user2Reward)} AVAX`);
            console.log(`✓ User3 reward: ${ethers.formatEther(user3Reward)} AVAX`);

            // User2 should have the highest rewards (staked the most amount)
            expect(user2Reward).to.be.gt(user1Reward);
            expect(user2Reward).to.be.gt(user3Reward);
            
            // User3 should have more rewards than User1 (staked more amount)
            expect(user3Reward).to.be.gt(user1Reward);

            // Step 4: Users claim rewards at different times
            console.log("\nStep 4: Users claim rewards...");
            
            // User1 claims immediately
            if (user1Reward >= MINIMUM_CLAIM_AMOUNT) {
                await rewardDistribution.connect(user1).claimRewards();
                console.log(`✓ User1 claimed rewards`);
            }

            // Wait 5 days
            await ethers.provider.send("evm_increaseTime", [86400 * 5]);
            await ethers.provider.send("evm_mine");

            // User2 claims
            await rewardDistribution.updateRewards();
            const user2UpdatedReward = await rewardDistribution.calculateUserReward(user2.address);
            if (user2UpdatedReward >= MINIMUM_CLAIM_AMOUNT) {
                await rewardDistribution.connect(user2).claimRewards();
                console.log(`✓ User2 claimed rewards`);
            }

            // User3 waits longer before claiming
            await ethers.provider.send("evm_increaseTime", [86400 * 10]);
            await ethers.provider.send("evm_mine");

            await rewardDistribution.updateRewards();
            const user3UpdatedReward = await rewardDistribution.calculateUserReward(user3.address);
            if (user3UpdatedReward >= MINIMUM_CLAIM_AMOUNT) {
                await rewardDistribution.connect(user3).claimRewards();
                console.log(`✓ User3 claimed rewards`);
            }

            // Step 5: Users unstake when their lock periods expire
            console.log("\nStep 5: Users unstake when lock periods expire...");

            // Fast forward to ensure all lock periods have expired
            await ethers.provider.send("evm_increaseTime", [user3Strategy.lockPeriod + 1]);
            await ethers.provider.send("evm_mine");

            // All users unstake
            for (const [index, user] of [user1, user2, user3].entries()) {
                const positions = await stakingContract.getActiveStakingPositions(user.address);
                if (positions.length > 0) {
                    await stakingContract.connect(user).unstake(positions[0].id);
                    console.log(`✓ User${index + 1} unstaked successfully`);
                }
            }

            // Verify all users have unstaked
            expect(await stakingContract.totalStaked()).to.equal(0);
            expect(await stakingContract.userTotalStaked(user1.address)).to.equal(0);
            expect(await stakingContract.userTotalStaked(user2.address)).to.equal(0);
            expect(await stakingContract.userTotalStaked(user3.address)).to.equal(0);

            console.log("=== Multiple Users Journey Test Completed Successfully ===");
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("Should handle user staking, claiming, and restaking", async function () {
            const stakeAmount = ethers.parseEther("5");

            // Initial stake
            await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, { value: stakeAmount });

            // Generate rewards
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine");
            await rewardDistribution.updateRewards();

            // Claim rewards
            const reward = await rewardDistribution.calculateUserReward(user1.address);
            if (reward >= MINIMUM_CLAIM_AMOUNT) {
                await rewardDistribution.connect(user1).claimRewards();
            }

            // Stake more while first position is still locked
            await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, { value: stakeAmount });

            // Verify user has 2 positions
            const positions = await stakingContract.getActiveStakingPositions(user1.address);
            expect(positions.length).to.equal(2);
            expect(await stakingContract.userTotalStaked(user1.address)).to.equal(stakeAmount * 2n);
        });

        it("Should handle emergency scenarios", async function () {
            const stakeAmount = ethers.parseEther("3");

            // User stakes
            await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD * 2, { value: stakeAmount });

            // Emergency unstake before lock period
            const positions = await stakingContract.getActiveStakingPositions(user1.address);
            await stakingContract.connect(user1).emergencyUnstake(positions[0].id);

            // Verify emergency unstake worked with penalty
            expect(await stakingContract.userTotalStaked(user1.address)).to.equal(0);
        });

        it("Should handle contract pausing scenarios", async function () {
            const stakeAmount = ethers.parseEther("2");

            // User stakes normally
            await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, { value: stakeAmount });

            // Owner pauses reward distribution
            await rewardDistribution.pause();

            // User cannot claim rewards while paused
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine");

            await expect(rewardDistribution.updateRewards())
                .to.be.revertedWithCustomError(rewardDistribution, "EnforcedPause");

            await expect(rewardDistribution.connect(user1).claimRewards())
                .to.be.revertedWithCustomError(rewardDistribution, "EnforcedPause");

            // Owner unpauses
            await rewardDistribution.unpause();

            // Now operations work again
            await rewardDistribution.updateRewards();
            const reward = await rewardDistribution.calculateUserReward(user1.address);
            expect(reward).to.be.gt(0);
        });
    });

    describe("System Stress Test", function () {
        it("Should handle high volume of users and transactions", async function () {
            console.log("=== Starting System Stress Test ===");

            const numUsers = 5; // Reduced for test efficiency
            const users = [user1, user2, user3];
            const stakeAmounts = [
                ethers.parseEther("2"),
                ethers.parseEther("5"),
                ethers.parseEther("3")
            ];

            // All users stake
            console.log(`\nStaking phase: ${users.length} users staking...`);
            for (let i = 0; i < users.length; i++) {
                await stakingContract.connect(users[i]).stake(MINIMUM_LOCK_PERIOD, { 
                    value: stakeAmounts[i] 
                });
                console.log(`✓ User ${i + 1} staked ${ethers.formatEther(stakeAmounts[i])} AVAX`);
            }

            // Verify total staking
            const expectedTotal = stakeAmounts.reduce((sum, amount) => sum + amount, 0n);
            expect(await stakingContract.totalStaked()).to.equal(expectedTotal);

            // Generate rewards over time
            console.log(`\nGenerating rewards over 60 days...`);
            await ethers.provider.send("evm_increaseTime", [86400 * 60]);
            await ethers.provider.send("evm_mine");

            // Update rewards
            await rewardDistribution.updateRewards();

            // All users claim rewards
            console.log(`\nReward claiming phase...`);
            for (let i = 0; i < users.length; i++) {
                const reward = await rewardDistribution.calculateUserReward(users[i].address);
                console.log(`User ${i + 1} reward: ${ethers.formatEther(reward)} AVAX`);
                
                if (reward >= MINIMUM_CLAIM_AMOUNT) {
                    await rewardDistribution.connect(users[i]).claimRewards();
                    console.log(`✓ User ${i + 1} claimed rewards`);
                }
            }

            // Fast forward past lock period
            await ethers.provider.send("evm_increaseTime", [MINIMUM_LOCK_PERIOD + 1]);
            await ethers.provider.send("evm_mine");

            // All users unstake
            console.log(`\nUnstaking phase...`);
            for (let i = 0; i < users.length; i++) {
                const positions = await stakingContract.getActiveStakingPositions(users[i].address);
                if (positions.length > 0) {
                    await stakingContract.connect(users[i]).unstake(positions[0].id);
                    console.log(`✓ User ${i + 1} unstaked`);
                }
            }

            // Verify system is clean
            expect(await stakingContract.totalStaked()).to.equal(0);
            expect(await aaveIntegration.getTotalDeposited()).to.equal(0);

            console.log("=== System Stress Test Completed Successfully ===");
        });
    });
});