const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingContract", function () {
  let stakingContract;
  let owner;
  let user1;
  let user2;

  const MINIMUM_STAKE = ethers.parseEther("1"); // 1 AVAX
  const MINIMUM_LOCK_PERIOD = 86400; // 1 day
  const MAXIMUM_LOCK_PERIOD = 31536000; // 1 year

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const StakingContract = await ethers.getContractFactory("StakingContract");
    stakingContract = await StakingContract.deploy(
      MINIMUM_STAKE,
      MINIMUM_LOCK_PERIOD,
      MAXIMUM_LOCK_PERIOD
    );
    await stakingContract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await stakingContract.owner()).to.equal(owner.address);
    });

    it("Should set the correct staking parameters", async function () {
      expect(await stakingContract.minimumStakeAmount()).to.equal(MINIMUM_STAKE);
      expect(await stakingContract.minimumLockPeriod()).to.equal(MINIMUM_LOCK_PERIOD);
      expect(await stakingContract.maximumLockPeriod()).to.equal(MAXIMUM_LOCK_PERIOD);
    });

    it("Should initialize with zero total staked", async function () {
      expect(await stakingContract.totalStaked()).to.equal(0);
    });
  });

  describe("Staking", function () {
    it("Should allow users to stake AVAX", async function () {
      const stakeAmount = ethers.parseEther("2");
      const lockPeriod = MINIMUM_LOCK_PERIOD;

      await expect(
        stakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount })
      ).to.emit(stakingContract, "Staked");

      expect(await stakingContract.totalStaked()).to.equal(stakeAmount);
      expect(await stakingContract.userTotalStaked(user1.address)).to.equal(stakeAmount);
    });

    it("Should reject stakes below minimum amount", async function () {
      const stakeAmount = ethers.parseEther("0.5");
      const lockPeriod = MINIMUM_LOCK_PERIOD;

      await expect(
        stakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount })
      ).to.be.revertedWithCustomError(stakingContract, "InsufficientStakeAmount");
    });

    it("Should reject invalid lock periods", async function () {
      const stakeAmount = ethers.parseEther("2");

      // Too short
      await expect(
        stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD - 1, { value: stakeAmount })
      ).to.be.revertedWithCustomError(stakingContract, "InvalidLockPeriod");

      // Too long
      await expect(
        stakingContract.connect(user1).stake(MAXIMUM_LOCK_PERIOD + 1, { value: stakeAmount })
      ).to.be.revertedWithCustomError(stakingContract, "InvalidLockPeriod");
    });

    it("Should create multiple staking positions for same user", async function () {
      const stakeAmount1 = ethers.parseEther("2");
      const stakeAmount2 = ethers.parseEther("3");
      const lockPeriod = MINIMUM_LOCK_PERIOD;

      await stakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount1 });
      await stakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount2 });

      const positions = await stakingContract.getStakingPositions(user1.address);
      expect(positions.length).to.equal(2);
      expect(positions[0].amount).to.equal(stakeAmount1);
      expect(positions[1].amount).to.equal(stakeAmount2);
    });
  });

  describe("Position Management", function () {
    beforeEach(async function () {
      const stakeAmount = ethers.parseEther("2");
      const lockPeriod = MINIMUM_LOCK_PERIOD;
      await stakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount });
    });

    it("Should return correct staking positions", async function () {
      const positions = await stakingContract.getStakingPositions(user1.address);
      expect(positions.length).to.equal(1);
      expect(positions[0].staker).to.equal(user1.address);
      expect(positions[0].amount).to.equal(ethers.parseEther("2"));
      expect(positions[0].active).to.be.true;
    });

    it("Should return only active positions", async function () {
      // Add another position
      await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, {
        value: ethers.parseEther("1")
      });

      const activePositions = await stakingContract.getActiveStakingPositions(user1.address);
      expect(activePositions.length).to.equal(2);

      for (let position of activePositions) {
        expect(position.active).to.be.true;
      }
    });

    it("Should check if position can be unstaked", async function () {
      const canUnstakeNow = await stakingContract.canUnstake(1);
      expect(canUnstakeNow).to.be.false;

      // Fast forward time
      await time.increase(MINIMUM_LOCK_PERIOD);

      const canUnstakeLater = await stakingContract.canUnstake(1);
      expect(canUnstakeLater).to.be.true;
    });

    it("Should return correct remaining lock time", async function () {
      const remainingTime = await stakingContract.getRemainingLockTime(1);
      expect(remainingTime).to.be.closeTo(MINIMUM_LOCK_PERIOD, 5);

      // Fast forward time
      await time.increase(MINIMUM_LOCK_PERIOD);

      const remainingTimeAfter = await stakingContract.getRemainingLockTime(1);
      expect(remainingTimeAfter).to.equal(0);
    });
  });

  describe("Unstaking", function () {
    beforeEach(async function () {
      const stakeAmount = ethers.parseEther("2");
      const lockPeriod = MINIMUM_LOCK_PERIOD;
      await stakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount });
    });

    it("Should allow unstaking after lock period", async function () {
      // Fast forward time
      await time.increase(MINIMUM_LOCK_PERIOD);

      const initialBalance = await ethers.provider.getBalance(user1.address);

      await expect(
        stakingContract.connect(user1).unstake(1)
      ).to.emit(stakingContract, "Unstaked");

      const finalBalance = await ethers.provider.getBalance(user1.address);
      expect(finalBalance).to.be.gt(initialBalance);

      expect(await stakingContract.totalStaked()).to.equal(0);
      expect(await stakingContract.userTotalStaked(user1.address)).to.equal(0);
    });

    it("Should reject unstaking before lock period", async function () {
      await expect(
        stakingContract.connect(user1).unstake(1)
      ).to.be.revertedWithCustomError(stakingContract, "LockPeriodNotExpired");
    });

    it("Should reject unstaking by unauthorized user", async function () {
      await time.increase(MINIMUM_LOCK_PERIOD);

      await expect(
        stakingContract.connect(user2).unstake(1)
      ).to.be.revertedWithCustomError(stakingContract, "UnauthorizedAccess");
    });

    it("Should reject unstaking inactive position", async function () {
      await time.increase(MINIMUM_LOCK_PERIOD);
      await stakingContract.connect(user1).unstake(1);

      await expect(
        stakingContract.connect(user1).unstake(1)
      ).to.be.revertedWithCustomError(stakingContract, "PositionNotActive");
    });
  });

  describe("Emergency Unstaking", function () {
    beforeEach(async function () {
      const stakeAmount = ethers.parseEther("2");
      const lockPeriod = MINIMUM_LOCK_PERIOD;
      await stakingContract.connect(user1).stake(lockPeriod, { value: stakeAmount });
    });

    it("Should allow emergency unstaking with penalty", async function () {
      const initialBalance = await ethers.provider.getBalance(user1.address);

      await expect(
        stakingContract.connect(user1).emergencyUnstake(1)
      ).to.emit(stakingContract, "EmergencyWithdraw");

      const finalBalance = await ethers.provider.getBalance(user1.address);
      expect(finalBalance).to.be.gt(initialBalance);

      expect(await stakingContract.totalStaked()).to.equal(0);
    });
  });

  describe("Access Control", function () {
    it("Should allow owner to update staking parameters", async function () {
      const newMinStake = ethers.parseEther("0.5");
      const newMinLock = 43200; // 12 hours
      const newMaxLock = 63072000; // 2 years

      await stakingContract.updateStakingParameters(newMinStake, newMinLock, newMaxLock);

      expect(await stakingContract.minimumStakeAmount()).to.equal(newMinStake);
      expect(await stakingContract.minimumLockPeriod()).to.equal(newMinLock);
      expect(await stakingContract.maximumLockPeriod()).to.equal(newMaxLock);
    });

    it("Should reject parameter updates from non-owner", async function () {
      await expect(
        stakingContract.connect(user1).updateStakingParameters(
          ethers.parseEther("0.5"), 43200, 63072000
        )
      ).to.be.revertedWithCustomError(stakingContract, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to pause and unpause", async function () {
      await stakingContract.pause();

      await expect(
        stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, {
          value: ethers.parseEther("2")
        })
      ).to.be.revertedWithCustomError(stakingContract, "EnforcedPause");

      await stakingContract.unpause();

      await expect(
        stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, {
          value: ethers.parseEther("2")
        })
      ).to.not.be.reverted;
    });
  });

  describe("Contract State", function () {
    it("Should return correct contract balance", async function () {
      const stakeAmount = ethers.parseEther("5");
      await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, { value: stakeAmount });

      expect(await stakingContract.getContractBalance()).to.equal(stakeAmount);
    });

    it("Should track total staked correctly with multiple users", async function () {
      const stake1 = ethers.parseEther("2");
      const stake2 = ethers.parseEther("3");

      await stakingContract.connect(user1).stake(MINIMUM_LOCK_PERIOD, { value: stake1 });
      await stakingContract.connect(user2).stake(MINIMUM_LOCK_PERIOD, { value: stake2 });

      expect(await stakingContract.totalStaked()).to.equal(stake1 + stake2);
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