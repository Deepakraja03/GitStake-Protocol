const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AaveIntegration", function () {
    let aaveIntegration;
    let stakingContract;
    let owner;
    let user1;
    let user2;

    const MINIMUM_STAKE = ethers.parseEther("1");
    const MINIMUM_LOCK_PERIOD = 86400; // 1 day
    const MAXIMUM_LOCK_PERIOD = 31536000; // 1 year

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

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

        // Set Aave integration in staking contract
        await stakingContract.setAaveIntegration(await aaveIntegration.getAddress());
        
        // Authorize staking contract to withdraw from Aave
        await aaveIntegration.addAuthorizedContract(await stakingContract.getAddress());
    });

    describe("Deployment", function () {
        it("Should deploy AaveIntegration contract correctly", async function () {
            expect(await aaveIntegration.owner()).to.equal(owner.address);
            expect(await aaveIntegration.getTotalDeposited()).to.equal(0);
            expect(await aaveIntegration.getAccruedInterest()).to.equal(0);
        });

        it("Should set Aave integration in staking contract", async function () {
            expect(await stakingContract.aaveIntegration()).to.equal(await aaveIntegration.getAddress());
        });
    });

    describe("Aave Integration Basic Functions", function () {
        it("Should deposit AVAX to Aave", async function () {
            const depositAmount = ethers.parseEther("5");
            
            await expect(aaveIntegration.depositToAave(depositAmount, { value: depositAmount }))
                .to.emit(aaveIntegration, "DepositedToAave");

            expect(await aaveIntegration.getTotalDeposited()).to.equal(depositAmount);
            expect(await aaveIntegration.getATokenBalance()).to.equal(depositAmount);
        });

        it("Should withdraw AVAX from Aave", async function () {
            const depositAmount = ethers.parseEther("5");
            const withdrawAmount = ethers.parseEther("2");

            // First deposit
            await aaveIntegration.depositToAave(depositAmount, { value: depositAmount });

            // Then withdraw
            const initialBalance = await ethers.provider.getBalance(owner.address);
            await expect(aaveIntegration.withdrawFromAave(withdrawAmount))
                .to.emit(aaveIntegration, "WithdrawnFromAave");

            expect(await aaveIntegration.getTotalDeposited()).to.equal(depositAmount - withdrawAmount);
        });

        it("Should track accrued interest over time", async function () {
            const depositAmount = ethers.parseEther("10");
            
            await aaveIntegration.depositToAave(depositAmount, { value: depositAmount });
            
            // Fast forward time by 1 day
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            
            const interest = await aaveIntegration.getAccruedInterest();
            expect(interest).to.be.gt(0);
        });

        it("Should update interest manually", async function () {
            const depositAmount = ethers.parseEther("10");
            
            await aaveIntegration.depositToAave(depositAmount, { value: depositAmount });
            
            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            
            await expect(aaveIntegration.updateInterest())
                .to.emit(aaveIntegration, "InterestUpdated");
        });
    });

    describe("Integration with Staking Contract", function () {
        it("Should automatically deposit to Aave when staking", async function () {
            const stakeAmount = ethers.parseEther("5");
            const lockPeriod = MINIMUM_LOCK_PERIOD;

            await expect(stakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount }))
                .to.emit(stakingContract, "TokensDepositedToAave")
                .withArgs(stakeAmount);

            expect(await aaveIntegration.getTotalDeposited()).to.equal(stakeAmount);
            expect(await stakingContract.totalStaked()).to.equal(stakeAmount);
        });

        it("Should automatically withdraw from Aave when unstaking", async function () {
            const stakeAmount = ethers.parseEther("5");
            const lockPeriod = MINIMUM_LOCK_PERIOD;

            // Stake tokens
            await stakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount });
            
            // Verify tokens were deposited to Aave
            expect(await aaveIntegration.getTotalDeposited()).to.equal(stakeAmount);
            
            // Fast forward past lock period
            await ethers.provider.send("evm_increaseTime", [lockPeriod + 1]);
            await ethers.provider.send("evm_mine");

            // Get user positions
            const positions = await stakingContract.getActiveStakingPositions(user1.address);
            const positionId = positions[0].id;

            // Verify the staking contract is authorized
            expect(await aaveIntegration.authorizedContracts(await stakingContract.getAddress())).to.be.true;

            // Check balances before unstaking
            const aaveBalanceBefore = await aaveIntegration.getTotalDeposited();
            const userBalanceBefore = await ethers.provider.getBalance(user1.address);
            
            // Unstake - this should work and emit the Unstaked event at minimum
            await expect(stakingContract.connect(user1).unstake(positionId))
                .to.emit(stakingContract, "Unstaked");
            
            // Check if user received their funds back
            const userBalanceAfter = await ethers.provider.getBalance(user1.address);
            expect(userBalanceAfter).to.be.gt(userBalanceBefore);
            
            // Check if Aave balance decreased (indicating withdrawal occurred)
            const aaveBalanceAfter = await aaveIntegration.getTotalDeposited();
            expect(aaveBalanceAfter).to.be.lt(aaveBalanceBefore);
        });

        it("Should handle multiple users staking and generating interest", async function () {
            const stakeAmount1 = ethers.parseEther("5");
            const stakeAmount2 = ethers.parseEther("10");
            const lockPeriod = MINIMUM_LOCK_PERIOD;

            // User1 stakes
            await stakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount1 });
            
            // User2 stakes
            await stakingContract.connect(user2).stake(lockPeriod, { value: stakeAmount2 });

            expect(await aaveIntegration.getTotalDeposited()).to.equal(stakeAmount1 + stakeAmount2);
            
            // Fast forward time to generate interest
            await ethers.provider.send("evm_increaseTime", [86400 * 30]); // 30 days
            await ethers.provider.send("evm_mine");
            
            const interest = await aaveIntegration.getAccruedInterest();
            expect(interest).to.be.gt(0);
            
            // Check that staking contract can see the rewards
            const rewards = await stakingContract.getAaveRewards();
            expect(rewards).to.equal(interest);
        });
    });

    describe("Error Handling", function () {
        it("Should revert when depositing zero amount", async function () {
            await expect(aaveIntegration.depositToAave(0, { value: 0 }))
                .to.be.revertedWithCustomError(aaveIntegration, "InvalidAmount");
        });

        it("Should revert when withdrawing more than deposited", async function () {
            const depositAmount = ethers.parseEther("5");
            const withdrawAmount = ethers.parseEther("10");

            await aaveIntegration.depositToAave(depositAmount, { value: depositAmount });

            await expect(aaveIntegration.withdrawFromAave(withdrawAmount))
                .to.be.revertedWithCustomError(aaveIntegration, "InsufficientBalance");
        });

        it("Should revert when withdrawing zero amount", async function () {
            await expect(aaveIntegration.withdrawFromAave(0))
                .to.be.revertedWithCustomError(aaveIntegration, "InvalidAmount");
        });

        it("Should handle Aave integration gracefully when not set", async function () {
            // Deploy new staking contract without Aave integration
            const StakingContract = await ethers.getContractFactory("StakingContract");
            const newStakingContract = await StakingContract.deploy(
                MINIMUM_STAKE,
                MINIMUM_LOCK_PERIOD,
                MAXIMUM_LOCK_PERIOD
            );

            const stakeAmount = ethers.parseEther("5");
            const lockPeriod = MINIMUM_LOCK_PERIOD;

            // Should still work without Aave integration
            await expect(newStakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount }))
                .to.emit(newStakingContract, "Staked");

            expect(await newStakingContract.getAaveRewards()).to.equal(0);
        });
    });

    describe("Access Control", function () {
        it("Should only allow owner to set Aave contracts", async function () {
            await expect(aaveIntegration.connect(user1).setAaveContracts(user1.address, user2.address))
                .to.be.revertedWithCustomError(aaveIntegration, "OwnableUnauthorizedAccount");
        });

        it("Should only allow owner to emergency withdraw", async function () {
            const depositAmount = ethers.parseEther("5");
            await aaveIntegration.depositToAave(depositAmount, { value: depositAmount });

            await expect(aaveIntegration.connect(user1).emergencyWithdraw(depositAmount))
                .to.be.revertedWithCustomError(aaveIntegration, "OwnableUnauthorizedAccount");
        });

        it("Should only allow owner to pause/unpause", async function () {
            await expect(aaveIntegration.connect(user1).pause())
                .to.be.revertedWithCustomError(aaveIntegration, "OwnableUnauthorizedAccount");

            await expect(aaveIntegration.connect(user1).unpause())
                .to.be.revertedWithCustomError(aaveIntegration, "OwnableUnauthorizedAccount");
        });
    });

    describe("Pausable Functionality", function () {
        it("Should prevent deposits when paused", async function () {
            await aaveIntegration.pause();
            
            await expect(aaveIntegration.depositToAave(ethers.parseEther("1"), { value: ethers.parseEther("1") }))
                .to.be.revertedWithCustomError(aaveIntegration, "EnforcedPause");
        });

        it("Should prevent withdrawals when paused", async function () {
            const depositAmount = ethers.parseEther("5");
            await aaveIntegration.depositToAave(depositAmount, { value: depositAmount });
            
            await aaveIntegration.pause();
            
            await expect(aaveIntegration.withdrawFromAave(ethers.parseEther("1")))
                .to.be.revertedWithCustomError(aaveIntegration, "EnforcedPause");
        });

        it("Should allow operations after unpausing", async function () {
            await aaveIntegration.pause();
            await aaveIntegration.unpause();
            
            const depositAmount = ethers.parseEther("5");
            await expect(aaveIntegration.depositToAave(depositAmount, { value: depositAmount }))
                .to.emit(aaveIntegration, "DepositedToAave");
        });
    });

    describe("Interest Calculation", function () {
        it("Should calculate interest correctly over different time periods", async function () {
            const depositAmount = ethers.parseEther("100"); // Large amount for easier calculation
            
            await aaveIntegration.depositToAave(depositAmount, { value: depositAmount });
            
            // Test 1 day interest
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine");
            
            const oneDayInterest = await aaveIntegration.getAccruedInterest();
            expect(oneDayInterest).to.be.gt(0);
            
            // Test 1 week interest
            await ethers.provider.send("evm_increaseTime", [86400 * 6]); // 6 more days
            await ethers.provider.send("evm_mine");
            
            const oneWeekInterest = await aaveIntegration.getAccruedInterest();
            expect(oneWeekInterest).to.be.gt(oneDayInterest);
            expect(oneWeekInterest).to.be.approximately(oneDayInterest * 7n, oneDayInterest);
        });

        it("Should handle zero deposits correctly", async function () {
            expect(await aaveIntegration.getAccruedInterest()).to.equal(0);
            
            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            
            expect(await aaveIntegration.getAccruedInterest()).to.equal(0);
        });

        it("Should allow authorized contract to withdraw directly", async function () {
            const depositAmount = ethers.parseEther("5");
            const withdrawAmount = ethers.parseEther("2");

            // Deposit to Aave
            await aaveIntegration.depositToAave(depositAmount, { value: depositAmount });
            
            // Get balance before withdrawal
            const balanceBefore = await aaveIntegration.getTotalDeposited();
            
            // Test withdrawal using the test function
            await expect(stakingContract.testAaveWithdrawal(withdrawAmount))
                .to.emit(stakingContract, "TokensWithdrawnFromAave")
                .withArgs(withdrawAmount);
                
            const balanceAfter = await aaveIntegration.getTotalDeposited();
            expect(balanceAfter).to.equal(balanceBefore - withdrawAmount);
        });
    });
});