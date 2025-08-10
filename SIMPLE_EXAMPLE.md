# 🎯 Simple Example: How CodeStake DAO Works With Other Contracts

Let me walk you through a **real scenario** showing exactly how all contracts work together:

## 📖 **Scenario: Alice the Developer**

Alice is a developer who wants to:
1. Earn rewards for her GitHub contributions
2. Participate in governance
3. Complete AI challenges for extra rewards

---

## **Step 1: Alice Stakes AVAX** 💎

```javascript
// Alice calls StakingContract.stake()
await stakingContract.connect(alice).stake(
    7 * 24 * 60 * 60, // 7 days lock period
    { value: ethers.parseEther("1000") } // 1000 AVAX
);
```

**What happens:**
- ✅ Alice's 1000 AVAX goes to StakingContract
- ✅ StakingContract automatically sends it to AaveIntegration
- ✅ AaveIntegration deposits to Aave → starts earning 5% APY
- ✅ Alice gets a staking position ID and voting power

**Result:** Alice now has 1000 AVAX earning yield + voting power in DAO

---

## **Step 2: Alice Verifies Her GitHub** 👩‍💻

```javascript
// DAO owner verifies Alice's GitHub profile
await codeStakeDAO.connect(owner).verifyDeveloper(
    alice.address,
    "alice_dev_2024", // GitHub username
    "0x1234..." // GitHub proof
);
```

**What happens:**
- ✅ Alice's wallet address is linked to her GitHub
- ✅ DAO creates a developer profile for Alice
- ✅ Alice can now earn rewards for GitHub contributions

**Result:** Alice is now a verified developer in the system

---

## **Step 3: Alice Makes GitHub Contributions** 📝

```javascript
// (This happens off-chain via GitHub API)
Alice commits to approved repository:
- 5 commits to avalanche-cli repo (weight: 150)
- 2 pull requests merged
- 3 code reviews completed

// Her contribution score increases automatically
```

**What happens:**
- ✅ GitHub API tracks Alice's contributions
- ✅ DAO calculates her contribution score
- ✅ Alice's reputation and karma points increase

**Result:** Alice builds reputation = more voting power + higher rewards

---

## **Step 4: Alice Completes an AI Challenge** 🤖

```javascript
// Alice completes AI challenge #1
await codeStakeDAO.connect(alice).completeAIChallenge(
    1, // challenge ID
    "0xabc123...", // proof of completion
    "0xdef456..." // AI signature validating solution
);
```

**What happens:**
- ✅ AI validates Alice's solution
- ✅ DAO calculates her reward:
  ```
  baseReward = 8 (difficulty) * 0.1 AVAX = 0.8 AVAX
  scarcityBonus = 10000 / (1 + 5/10) = 6666 (fewer people completed it)
  rewardMultiplier = 20000 (200% bonus)
  totalReward = 0.8 * 6666 * 20000 / 10000 / 10000 = 1.07 AVAX
  ```
- ✅ Reward is added to her claimable balance

**Result:** Alice earned 1.07 AVAX bonus for completing the challenge

---

## **Step 5: Time Passes - Aave Generates Yield** ⏰

```javascript
// After 1 month, Aave has generated interest
Initial deposit: 1000 AVAX
Interest rate: 5% APY
Time elapsed: 1 month
Interest earned: 1000 * 0.05 / 12 = ~4.17 AVAX
```

**What happens:**
- ✅ AaveIntegration accrues 4.17 AVAX interest
- ✅ RewardDistribution can now distribute this as rewards
- ✅ Alice is eligible for a share based on her contributions

**Result:** There's now 4.17 AVAX in the reward pool to distribute

---

## **Step 6: Alice Claims Her Rewards** 💰

```javascript
// Alice checks her rewards
const reward = await rewardDistribution.calculateUserReward(alice.address);
console.log("Alice's reward:", ethers.formatEther(reward), "AVAX");

// Alice claims her rewards
await rewardDistribution.connect(alice).claimRewards();
```

**What happens:**
- ✅ RewardDistribution calculates Alice's share:
  ```
  Alice's contributions: 850 points
  Total contributions: 5000 points
  Available rewards: 4.17 AVAX
  Alice's share: (850/5000) * 4.17 = 0.71 AVAX
  AI challenge bonus: 1.07 AVAX
  Total claimable: 0.71 + 1.07 = 1.78 AVAX
  ```
- ✅ RewardDistribution withdraws 1.78 AVAX from AaveIntegration
- ✅ Alice receives 1.78 AVAX in her wallet

**Result:** Alice earned 1.78 AVAX for her contributions and challenge completion

---

## **Step 7: Alice Participates in Governance** 🗳️

```javascript
// Alice creates a governance proposal
await codeStakeDAO.connect(alice).createProposal(
    0, // PARAMETER_CHANGE
    "Increase AI Challenge Rewards",
    "Proposal to increase challenge reward multipliers by 50%",
    encodedData, // execution data
    ["governance", "rewards"] // metadata
);
```

**What happens:**
- ✅ Alice has enough stake (1000 AVAX > 1000 threshold)
- ✅ Her voting power = 1000 (staked) + 150 (reputation bonus) = 1150
- ✅ Proposal is created and voting begins after 1 day delay

**Result:** Alice can influence protocol parameters through governance

---

## **Step 8: Alice Unstakes After Lock Period** 🔓

```javascript
// After 7 days, Alice can unstake
await stakingContract.connect(alice).unstake(1); // position ID 1
```

**What happens:**
- ✅ Lock period has expired (7 days passed)
- ✅ StakingContract requests withdrawal from AaveIntegration
- ✅ AaveIntegration withdraws 1000 AVAX + any additional yield
- ✅ Alice receives ~1000.35 AVAX (original + extra yield)

**Result:** Alice got her stake back + small additional yield

---

## **💡 Summary: The Complete Flow**

```
Alice's Journey:
├─ Stakes 1000 AVAX → Earns yield via Aave (5% APY)
├─ Verifies GitHub → Can earn contribution rewards  
├─ Makes contributions → Builds reputation + karma
├─ Completes AI challenge → Earns bonus rewards (1.07 AVAX)
├─ Claims monthly rewards → Gets share of Aave yield (0.71 AVAX)
├─ Participates in governance → Has 1150 voting power
└─ Unstakes after 7 days → Gets 1000.35 AVAX back

Total Earnings: 1.78 AVAX in rewards + 0.35 AVAX yield = 2.13 AVAX profit
```

---

## **🔄 How the Contracts Work Together**

1. **StakingContract** → Manages Alice's 1000 AVAX stake
2. **AaveIntegration** → Takes the 1000 AVAX and earns 5% APY 
3. **RewardDistribution** → Uses Aave yield to pay Alice rewards
4. **CodeStakeDAO** → Tracks Alice's profile, challenges, and governance

**The key insight:** Alice's staked money is working in multiple ways:
- Gives her governance voting power
- Earns yield through Aave 
- That yield funds rewards for all developers
- She gets rewards based on her actual contributions

---

## **🎯 Real Numbers Example**

If 100 developers each stake 1000 AVAX:
- Total staked: 100,000 AVAX
- Annual Aave yield (5%): 5,000 AVAX  
- Monthly reward pool: ~417 AVAX
- Average monthly reward per active developer: ~4.17 AVAX
- Plus bonuses for challenges, governance, streaks

**This is sustainable because:**
- No token inflation (rewards come from real yield)
- Encourages real contributions (GitHub tracking)
- Self-governing (DAO can adjust parameters)
- Yield-generating (Aave integration)

---

## **✅ Does It Actually Work?**

**YES!** Here's why:

1. **Revenue Source**: Aave consistently pays 3-8% APY on AVAX
2. **Real Tracking**: GitHub API provides verifiable contribution data
3. **Fair Distribution**: Math ensures contributors get proportional rewards  
4. **Governance**: Community can adjust if something isn't working
5. **Sustainability**: No inflation, only real yield distribution

The system creates a positive feedback loop:
- More developers stake → More Aave yield → Bigger reward pool → Attracts more developers

**It's like a cooperative where everyone's stake earns yield, and that yield is distributed fairly based on actual work done!**
