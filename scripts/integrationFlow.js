const hre = require("hardhat");
const { ethers, network } = hre;

// Usage:
// 1) Set env vars (optional):
//    STAKING_ADDRESS, AAVE_ADDRESS, REWARD_ADDRESS,
//    STAKE_AMOUNT,
//    LOCK_MINUTES=10 (or LOCK_SECONDS), UPDATE_PARAMS=true (attempt owner-only param update),
//    FUND_REWARDS=true, EMERGENCY_UNSTAKE=true
// 2) Run:
//    npx hardhat run scripts/integrationFlow.js --network <hardhat|localhost|fuji|gitstake_l1>

// Defaults from README (Fuji)
const DEFAULT_ADDRESSES = {
  fuji: {
    AAVE_ADDRESS: "0x1AE62F9146C772d3224636425ADD287e12fc92e8", // RealAaveIntegration
    STAKING_ADDRESS: "0x4b02E32b57C65352d9bBA68a110E2F80B208aFec", // StakingContract
    REWARD_ADDRESS: "0x3b8044e6ECF1e4C5a529B194c1305b157a68e92B", // RewardDistribution
  },
};

// Explorer helpers: set EXPLORER_BASE to override (e.g., https://testnet.snowtrace.io)
function getExplorerBase() {
  if (process.env.EXPLORER_BASE && process.env.EXPLORER_BASE !== "") {
    return process.env.EXPLORER_BASE.replace(/\/$/, "");
  }
  const chainId = hre.network.config && hre.network.config.chainId;
  switch (Number(chainId || 0)) {
    case 43113:
      return "https://testnet.snowtrace.io";
    case 43114:
      return "https://snowtrace.io";
    default:
      return null;
  }
}

function logTxLink(txOrRc, label = "Transaction") {
  try {
    const base = getExplorerBase();
    const hash = (txOrRc && (txOrRc.hash || txOrRc.transactionHash)) || txOrRc;
    if (hash) {
      if (base) {
        console.log(`${label} explorer: ${base}/tx/${hash}`);
      } else {
        console.log(`${label} hash: ${hash} (set EXPLORER_BASE to enable clickable link)`);
      }
    }
  } catch (_) {
    // no-op
  }
}

function addr(name) {
  const net = network.name;
  const env = process.env[`${name}`];
  if (env && env !== "") return env;
  if (DEFAULT_ADDRESSES[net] && DEFAULT_ADDRESSES[net][name]) return DEFAULT_ADDRESSES[net][name];
  return undefined;
}

async function maybeSetAaveIntegration(staking, aave) {
  const current = await staking.aaveIntegration();
  if (current.toLowerCase() !== (await aave.getAddress()).toLowerCase()) {
    console.log("Setting Aave integration on StakingContract...");
    const tx = await staking.setAaveIntegration(await aave.getAddress());
    const rc = await tx.wait();
    logTxLink(rc, "Set Aave integration");
    console.log("✓ Aave integration set");
  } else {
    console.log("Aave integration already set on StakingContract");
  }
}

async function maybeAuthorizeStakingOnAave(aave, stakingAddress) {
  try {
    const authorized = await aave.authorizedContracts(stakingAddress);
    if (!authorized) {
      console.log("Authorizing StakingContract on AaveIntegration...");
      const tx = await aave.addAuthorizedContract(stakingAddress);
      await tx.wait();
      console.log("✓ StakingContract authorized on AaveIntegration");
    } else {
      console.log("StakingContract already authorized on AaveIntegration");
    }
  } catch (e) {
    console.warn("! Could not verify/authorize staking on AaveIntegration (are you Aave owner?)", e.message);
  }
}

async function maybeSetRewardLinks(staking, reward, aave) {
  // Link from Staking -> Reward
  try {
    const currentReward = await staking.rewardDistribution();
    if (currentReward.toLowerCase() !== (await reward.getAddress()).toLowerCase()) {
      console.log("Setting RewardDistribution on StakingContract...");
      const tx = await staking.setRewardDistribution(await reward.getAddress());
      await tx.wait();
      console.log("✓ RewardDistribution set on StakingContract");
    } else {
      console.log("RewardDistribution already set on StakingContract");
    }
  } catch (e) {
    console.warn("! Could not set rewardDistribution on StakingContract (are you owner?)", e.message);
  }

  // Link inside Reward contract
  try {
    console.log("Configuring RewardDistribution links...");
    const tx = await reward.setContracts(
      await staking.getAddress(),
      await aave.getAddress()
    );
    await tx.wait();
    console.log("✓ RewardDistribution linked to Staking and Aave");
  } catch (e) {
    console.warn("! Could not set contracts on RewardDistribution (are you owner?)", e.message);
  }
}

async function stakeFlow(staking, signer) {
  const minStake = await staking.minimumStakeAmount();
  const minLock = await staking.minimumLockPeriod();
  const maxLock = await staking.maximumLockPeriod();

  const amount = ethers.parseEther(process.env.STAKE_AMOUNT || ethers.formatEther(minStake));

  // Allow short locks via env: LOCK_SECONDS or LOCK_MINUTES. Default to 10 minutes.
  let desiredLock = Number(process.env.LOCK_SECONDS || 0);
  if (!desiredLock) {
    const mins = Number(process.env.LOCK_MINUTES || 10);
    desiredLock = Math.floor(mins * 60);
  }
  // Clamp to on-chain bounds
  let lock = desiredLock;
  if (lock < Number(minLock)) lock = Number(minLock);
  if (lock > Number(maxLock)) lock = Number(maxLock);

  console.log(`Staking ${ethers.formatEther(amount)} AVAX for lockPeriod ${lock} seconds...`);
  const tx = await staking.stake(lock, { value: amount });
  const rc = await tx.wait();
  logTxLink(rc, "Stake");
  console.log("✓ Stake tx mined:", rc?.hash);

  // Fetch positions to locate the new one
  const positions = await staking.getActiveStakingPositions(await signer.getAddress());
  if (positions.length === 0) throw new Error("No active positions after staking");
  const last = positions[positions.length - 1];
  console.log("New Position:", {
    id: last.id.toString(),
    amount: ethers.formatEther(last.amount),
    startTime: last.startTime.toString(),
    lockPeriod: last.lockPeriod.toString(),
    active: last.active,
  });

  return last.id;
}

async function rewardsFlow(reward, staking, aave, signer) {
  console.log("Updating rewards based on Aave interest...");
  try {
    const tx = await reward.updateRewards();
    await tx.wait();
    console.log("✓ Rewards updated");
  } catch (e) {
    console.warn("! updateRewards failed (contracts not linked or paused?)", e.message);
  }

  const myAddr = await signer.getAddress();
  const claimable = await reward.calculateUserReward(myAddr).catch(() => 0n);
  console.log("Claimable reward:", ethers.formatEther(claimable || 0n), "AVAX");

  if ((claimable || 0n) > 0n) {
    const fund = process.env.FUND_REWARDS === "true";
    if (fund) {
      console.log("Funding RewardDistribution so it can pay rewards...");
      const fundTx = await signer.sendTransaction({ to: await reward.getAddress(), value: claimable });
      const fundRc = await fundTx.wait();
      logTxLink(fundRc, "Fund RewardDistribution");
      console.log("✓ RewardDistribution funded");
    } else {
      console.log("Skip funding (set FUND_REWARDS=true to auto-fund)");
    }

    try {
      console.log("Claiming rewards...");
      const claimTx = await reward.claimRewards();
      const claimRc = await claimTx.wait();
      logTxLink(claimRc, "Claim Rewards");
      console.log("✓ Rewards claimed");
    } catch (e) {
      console.warn("! claimRewards failed (maybe insufficient balance or below minimum)", e.message);
    }
  }
}

async function unstakeFlow(staking, positionId) {
  const isHardhat = ["hardhat", "localhost"].includes(network.name);
  const canUnstake = await staking.canUnstake(positionId);

  if (canUnstake) {
    console.log("Lock expired; unstaking...");
    const tx = await staking.unstake(positionId);
    const rc = await tx.wait();
    logTxLink(rc, "Unstake");
    console.log("✓ Unstaked");
    return;
  }

  if (isHardhat) {
    const pos = await staking.stakingPositions(positionId);
    const now = Math.floor(Date.now() / 1000);
    const unlockAt = Number(pos.startTime) + Number(pos.lockPeriod);
    const increase = Math.max(unlockAt - now + 2, 2);
    console.log(`Advancing time by ~${increase}s to pass lock period (hardhat only)...`);
    await hre.network.provider.send("evm_increaseTime", [increase]);
    await hre.network.provider.send("evm_mine");

    const tx = await staking.unstake(positionId);
    const rc = await tx.wait();
    logTxLink(rc, "Unstake (time travel)");
    console.log("✓ Unstaked after time travel");
  } else {
    if (process.env.EMERGENCY_UNSTAKE === "true") {
      console.log("Lock active on live network; performing emergencyUnstake (10% penalty)...");
      const tx = await staking.emergencyUnstake(positionId);
      const rc = await tx.wait();
      logTxLink(rc, "Emergency Unstake");
      console.log("✓ Emergency unstaked");
    } else {
      console.log("Lock active; skipping unstake. Set EMERGENCY_UNSTAKE=true to force early exit.");
    }
  }
}

async function aaveDiagnostics(aave) {
  try {
    const pos = await aave.getAavePosition();
    const interest = await aave.getAccruedInterest();
    console.log("Aave Position:", {
      deposited: ethers.formatEther(pos.depositedAmount || 0n),
      aTokenBalance: ethers.formatEther(pos.aTokenBalance || 0n),
      accruedInterest: ethers.formatEther(interest || 0n),
    });
  } catch (e) {
    console.warn("! Could not read Aave diagnostics (maybe RealAaveIntegration without view funcs)", e.message);
  }
}

async function main() {
  console.log(`\n=== GitStake Protocol Integration Flow (${network.name}) ===`);
  const [signer] = await ethers.getSigners();
  console.log("Signer:", await signer.getAddress());

  const STAKING_ADDRESS = addr("STAKING_ADDRESS");
  const AAVE_ADDRESS = addr("AAVE_ADDRESS");
  const REWARD_ADDRESS = addr("REWARD_ADDRESS");

  if (!STAKING_ADDRESS || !AAVE_ADDRESS || !REWARD_ADDRESS) {
    throw new Error("Missing contract addresses. Set env STAKING_ADDRESS, AAVE_ADDRESS, REWARD_ADDRESS or use a network with defaults.");
  }

  const staking = await ethers.getContractAt("StakingContract", STAKING_ADDRESS, signer);
  const aave = await ethers.getContractAt("AaveIntegration", AAVE_ADDRESS, signer); // ABI-compatible
  const reward = await ethers.getContractAt("RewardDistribution", REWARD_ADDRESS, signer);

  console.log("Staking:", await staking.getAddress());
  console.log("AaveIntegration:", await aave.getAddress());
  console.log("RewardDistribution:", await reward.getAddress());

  // Optionally (owner-only) update staking parameters to allow short locks on testnets
  if (process.env.UPDATE_PARAMS === "true") {
    try {
      const minStake = await staking.minimumStakeAmount();
      const minLock = await staking.minimumLockPeriod();
      const maxLock = await staking.maximumLockPeriod();
      const desiredMinLock = Number(process.env.MIN_LOCK_SECONDS || 300); // 5 minutes
      const desiredMaxLock = Number(process.env.MAX_LOCK_SECONDS || 3600); // 1 hour
      if (Number(minLock) !== desiredMinLock || Number(maxLock) !== desiredMaxLock) {
        console.log(`Updating staking parameters (owner-only): minLock=${desiredMinLock}s maxLock=${desiredMaxLock}s`);
        const tx = await staking.updateStakingParameters(minStake, desiredMinLock, desiredMaxLock);
        await tx.wait();
        console.log("✓ Staking parameters updated");
      }
    } catch (e) {
      console.warn("! Could not update staking parameters (not owner?)", e.message);
    }
  }

  // Wire up links and authorizations
  await maybeAuthorizeStakingOnAave(aave, await staking.getAddress());
  await maybeSetAaveIntegration(staking, aave);
  await maybeSetRewardLinks(staking, reward, aave);

  await aaveDiagnostics(aave);

  // Stake
  const positionId = await stakeFlow(staking, signer);

  // Aave updates after stake
  await aaveDiagnostics(aave);

  // Rewards update/claim attempt
  await rewardsFlow(reward, staking, aave, signer);

  // Unstake path
  await unstakeFlow(staking, positionId);

  console.log("\n=== Integration flow complete ===\n");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Integration flow failed:", err);
      process.exit(1);
    });
}

