const { ethers } = require("hardhat");

// Integration script for EpochPrizePool with clear, step-by-step flow
// Usage examples:
//   EPOCH_PRIZE_POOL=0x... AAVE_INTEGRATION=0x... WINNER_SIGNER_PK=0x... WINNERS_CSV=0xA,0xB \
//   npx hardhat run scripts/integration_epoch_prize_pool.js --network fuji
//
// If env vars are not provided, it will try to use addresses from DEPLOYMENTS.md

const fs = require("fs");
const path = require("path");

function readFromDeploymentsFallback() {
  try {
    const file = fs.readFileSync(path.join(process.cwd(), "DEPLOYMENTS.md"), "utf8");
    const poolMatch = file.match(/EpochPrizePool:\s*`([^`]+)`/);
    const aaveMatch = file.match(/AaveIntegration:\s*`([^`]+)`/);
    return {
      pool: poolMatch ? poolMatch[1] : undefined,
      aave: aaveMatch ? aaveMatch[1] : undefined,
    };
  } catch (e) {
    return { pool: undefined, aave: undefined };
  }
}

function explorerFor(chainId) {
  switch (Number(chainId)) {
    case 43113: // Fuji
      return "https://testnet.snowtrace.io";
    case 43114: // Avalanche C-Chain Mainnet
      return "https://snowtrace.io";
    default:
      return null; // local/hardhat
  }
}

function linkTx(base, hash) {
  return base ? `${base}/tx/${hash}` : hash;
}

function linkAddress(base, addr) {
  return base ? `${base}/address/${addr}` : addr;
}

function parseWinnersCsv(csv) {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const explorer = explorerFor(chainId);
  console.log(`\nNetwork: ${ethers.toBeHex(chainId)} (${chainId}) | ${explorer || "no explorer"}`);

  // Resolve contract addresses
  const fallback = readFromDeploymentsFallback();
  const POOL_ADDR = process.env.EPOCH_PRIZE_POOL || fallback.pool;
  const AAVE_ADDR = process.env.AAVE_INTEGRATION || fallback.aave;
  if (!POOL_ADDR) throw new Error("EPOCH_PRIZE_POOL not provided and not found in DEPLOYMENTS.md");
  if (!AAVE_ADDR) throw new Error("AAVE_INTEGRATION not provided and not found in DEPLOYMENTS.md");

  // Params
  const AMOUNT_AVAX = 0.001; // fixed staking amount for demo
  const WINNERS = parseWinnersCsv(process.env.WINNERS_CSV); // optional: comma-separated addresses
  const WINNER_SIGNER_PK = process.env.WINNER_SIGNER_PK || process.env.PRIVATE_KEY; // fallback to deployer key

  // Contracts
  const pool = await ethers.getContractAt("EpochPrizePool", POOL_ADDR);
  const aave = await ethers.getContractAt("AaveIntegration", AAVE_ADDR);

  const [caller] = await ethers.getSigners();
  console.log("Caller:", caller.address, explorer ? linkAddress(explorer, caller.address) : "");
  console.log("EpochPrizePool:", POOL_ADDR, explorer ? linkAddress(explorer, POOL_ADDR) : "");
  console.log("AaveIntegration:", AAVE_ADDR, explorer ? linkAddress(explorer, AAVE_ADDR) : "");

  // STEP 1: Deposit AVAX to the current epoch
  console.log("\n[STEP 1] Deposit");
  console.log(`Depositing ${AMOUNT_AVAX} AVAX into EpochPrizePool...`);
  const tx1 = await pool.deposit({ value: ethers.parseEther(String(AMOUNT_AVAX)) });
  const rc1 = await tx1.wait();
  console.log("✓ Deposit tx:", explorer ? linkTx(explorer, rc1.hash) : rc1.hash);

  // Display current epoch info
  const epochId = await pool.currentEpochId();
  const ep = await pool.getEpoch(epochId);
  console.log("Current epoch:", Number(epochId));
  console.log({ startTime: Number(ep.startTime), endTime: Number(ep.endTime), totalStaked: String(ep.totalStaked) });

  // STEP 2: Backend submits winners (ranked list) with signature
  // For demo: if WINNERS_CSV provided and WINNER_SIGNER_PK is available, submit now
  if (WINNERS.length > 0 && WINNER_SIGNER_PK) {
    console.log("\n[STEP 2] Submit winners (backend)");
    const signer = new ethers.Wallet(WINNER_SIGNER_PK, ethers.provider);
    const abi = ethers.AbiCoder.defaultAbiCoder();
    const digest = ethers.keccak256(
      abi.encode(["address", "uint256", "address[]"], [POOL_ADDR, epochId, WINNERS])
    );
    const signature = await signer.signMessage(ethers.getBytes(digest));

    const tx2 = await pool.submitWinners(epochId, WINNERS, signature);
    const rc2 = await tx2.wait();
    console.log("✓ Winners submitted:", explorer ? linkTx(explorer, rc2.hash) : rc2.hash);
    console.log("Winners:", WINNERS.map((w) => (explorer ? linkAddress(explorer, w) : w)));
  } else {
    console.log("\n[STEP 2] Submit winners (backend)");
    console.log("- Skipped: Provide WINNERS_CSV and WINNER_SIGNER_PK env to submit winners now.");
  }

  // STEP 3: Auto-close & finalize after epoch end
  console.log("\n[STEP 3] Close & Finalize (auto)");
  const now = Math.floor(Date.now() / 1000);
  if (now < Number(ep.endTime)) {
    console.log("- Epoch not ended yet. After endTime, call: npx hardhat run scripts/integration_epoch_prize_pool.js --network <net> to perform poke/finalize.");
  } else {
    console.log("- Epoch ended. Triggering auto-close/finalize via poke()...");
    const tx3 = await pool.poke();
    const rc3 = await tx3.wait();
    console.log("✓ Poke tx:", explorer ? linkTx(explorer, rc3.hash) : rc3.hash);
  }

  // Refresh epoch state
  const ep2 = await pool.getEpoch(epochId);
  console.log("Epoch finalized:", ep2.finalized);
  console.log({ prizePool: String(ep2.prizePool), fee: String(ep2.feeAmount) });

  // STEP 4: Winner claims (only after finalized)
  if (ep2.finalized && WINNERS.length > 0) {
    console.log("\n[STEP 4] Winner Claim");
    // If caller is the first winner, try to claim. Otherwise, instruct user.
    const isWinner = WINNERS.map((w) => w.toLowerCase()).includes(caller.address.toLowerCase());
    if (isWinner) {
      const tx4 = await pool.claim(epochId);
      const rc4 = await tx4.wait();
      console.log("✓ Claim tx:", explorer ? linkTx(explorer, rc4.hash) : rc4.hash);
    } else {
      console.log("- Caller is not a winner. Winners should run: pool.claim(epochId)");
    }
  } else {
    console.log("\n[STEP 4] Winner Claim");
    console.log("- Skipped: Epoch not finalized or winners not submitted.");
  }

  // STEP 5: Owner withdraws platform fees
  console.log("\n[STEP 5] Owner Fee Withdraw (optional)");
  const feeEscrowTotal = await pool.feeEscrowTotal();
  if (feeEscrowTotal > 0n) {
    console.log(`- Fee escrow available: ${ethers.formatEther(feeEscrowTotal)} AVAX`);
    // Uncomment to withdraw to caller (must be owner)
    // const tx5 = await pool.withdrawFees(feeEscrowTotal, caller.address);
    // const rc5 = await tx5.wait();
    // console.log("✓ Fee withdraw tx:", explorer ? linkTx(explorer, rc5.hash) : rc5.hash);
  } else {
    console.log("- No fee escrowed yet.");
  }

  console.log("\nAll steps complete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

