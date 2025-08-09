// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./StakingContract.sol";
import "./AaveIntegration.sol";

/**
 * @title RewardDistribution
 * @dev Contract to calculate and distribute rewards based on Aave yield and staking positions
 */
contract RewardDistribution is ReentrancyGuard, Ownable, Pausable {
    
    struct RewardPool {
        uint256 totalRewards;
        uint256 distributedRewards;
        uint256 lastUpdateTime;
        uint256 rewardRate;
        uint256 accumulatedRewardPerToken;
    }
    
    struct UserReward {
        uint256 totalClaimed;
        uint256 lastClaimTime;
    }
    
    // State variables
    StakingContract public stakingContract;
    AaveIntegration public aaveIntegration;
    RewardPool public rewardPool;
    
    // User reward tracking
    mapping(address => UserReward) public userRewards;
    mapping(address => uint256) public userLastStakeTime;
    
    // Reward distribution parameters
    uint256 public constant REWARD_PRECISION = 1e18;
    uint256 public minimumClaimAmount;
    uint256 public rewardUpdateInterval;
    uint256 public lastRewardUpdate;
    
    // Events
    event RewardsUpdated(uint256 newRewards, uint256 timestamp);
    event RewardsClaimed(address indexed user, uint256 amount, uint256 timestamp);
    event RewardPoolUpdated(uint256 totalRewards, uint256 rewardRate);
    event ContractsSet(address stakingContract, address aaveIntegration);
    event MinimumClaimAmountUpdated(uint256 newAmount);
    
    // Custom errors
    error ContractsNotSet();
    error InsufficientRewards();
    error NoRewardsToClaim();
    error InvalidAmount();
    error RewardUpdateTooSoon();
    
    constructor(uint256 _minimumClaimAmount, uint256 _rewardUpdateInterval) Ownable(msg.sender) {
        minimumClaimAmount = _minimumClaimAmount;
        rewardUpdateInterval = _rewardUpdateInterval;
        lastRewardUpdate = block.timestamp;
        
        rewardPool = RewardPool({
            totalRewards: 0,
            distributedRewards: 0,
            lastUpdateTime: block.timestamp,
            rewardRate: 0,
            accumulatedRewardPerToken: 0
        });
    }
    
    /**
     * @dev Set the staking and Aave integration contracts
     * @param _stakingContract Address of the staking contract
     * @param _aaveIntegration Address of the Aave integration contract
     */
    function setContracts(address _stakingContract, address _aaveIntegration) external onlyOwner {
        stakingContract = StakingContract(payable(_stakingContract));
        aaveIntegration = AaveIntegration(payable(_aaveIntegration));
        emit ContractsSet(_stakingContract, _aaveIntegration);
    }
    
    /**
     * @dev Update rewards based on current Aave interest
     */
    function updateRewards() external nonReentrant whenNotPaused {
        if (address(stakingContract) == address(0) || address(aaveIntegration) == address(0)) {
            revert ContractsNotSet();
        }
        
        _updateRewardPool();
        emit RewardsUpdated(rewardPool.totalRewards, block.timestamp);
    }
    
    /**
     * @dev Calculate user's current reward amount
     * @param user Address of the user
     * @return Current reward amount for the user
     */
    function calculateUserReward(address user) external view returns (uint256) {
        return _calculateUserReward(user);
    }
    
    /**
     * @dev Claim rewards for the calling user
     */
    function claimRewards() external nonReentrant whenNotPaused {
        _updateRewardPool();
        
        uint256 reward = _calculateUserReward(msg.sender);
        
        if (reward == 0) {
            revert NoRewardsToClaim();
        }
        
        if (reward < minimumClaimAmount) {
            revert InsufficientRewards();
        }
        
        // Check if contract has sufficient balance
        if (address(this).balance < reward) {
            revert InsufficientRewards();
        }
        
        // Update user's claim tracking
        userRewards[msg.sender].totalClaimed += reward;
        userRewards[msg.sender].lastClaimTime = block.timestamp;
        
        // Update distributed rewards
        rewardPool.distributedRewards += reward;
        
        // Transfer reward to user
        (bool success, ) = payable(msg.sender).call{value: reward}("");
        if (!success) {
            revert InsufficientRewards();
        }
        
        emit RewardsClaimed(msg.sender, reward, block.timestamp);
    }
    
    /**
     * @dev Get current reward rate (rewards per second per token)
     * @return Current reward rate
     */
    function getRewardRate() external view returns (uint256) {
        return rewardPool.rewardRate;
    }
    
    /**
     * @dev Get total available rewards
     * @return Total rewards available for distribution
     */
    function getTotalRewards() external view returns (uint256) {
        return rewardPool.totalRewards;
    }
    
    /**
     * @dev Get total distributed rewards
     * @return Total rewards that have been distributed
     */
    function getDistributedRewards() external view returns (uint256) {
        return rewardPool.distributedRewards;
    }
    
    /**
     * @dev Get user's reward information
     * @param user Address of the user
     * @return UserReward struct with user's reward details
     */
    function getUserRewardInfo(address user) external view returns (UserReward memory) {
        return userRewards[user];
    }
    
    /**
     * @dev Get user's current claimable reward amount
     * @param user Address of the user
     * @return Current claimable reward amount
     */
    function getUserClaimableReward(address user) external view returns (uint256) {
        return _calculateUserReward(user);
    }
    
    /**
     * @dev Internal function to update the reward pool
     */
    function _updateRewardPool() internal {
        if (address(aaveIntegration) == address(0)) {
            return;
        }
        
        // Get current interest from Aave
        uint256 currentInterest = aaveIntegration.getAccruedInterest();
        
        // Simply update the total rewards to current interest
        rewardPool.totalRewards = currentInterest;
        rewardPool.lastUpdateTime = block.timestamp;
        lastRewardUpdate = block.timestamp;
        
        // Calculate reward rate based on time elapsed
        uint256 timeDelta = block.timestamp - rewardPool.lastUpdateTime;
        if (timeDelta > 0 && currentInterest > 0) {
            rewardPool.rewardRate = currentInterest / timeDelta;
        }
        
        emit RewardPoolUpdated(rewardPool.totalRewards, rewardPool.rewardRate);
    }
    
    /**
     * @dev Internal function to update user's reward (simplified)
     * @param user Address of the user
     */
    function _updateUserReward(address user) internal {
        // This function is now simplified since we calculate rewards on-demand
        // Just update the last interaction time if needed
    }
    
    /**
     * @dev Internal function to calculate user's current reward
     * @param user Address of the user
     * @return Current reward amount for the user
     */
    function _calculateUserReward(address user) internal view returns (uint256) {
        uint256 userStaked = stakingContract.userTotalStaked(user);
        
        if (userStaked == 0) {
            return 0;
        }
        
        // Get current interest from Aave
        uint256 currentInterest = 0;
        if (address(aaveIntegration) != address(0)) {
            currentInterest = aaveIntegration.getAccruedInterest();
        }
        
        uint256 totalStaked = stakingContract.totalStaked();
        if (totalStaked == 0) {
            return 0;
        }
        
        // Calculate user's proportional share of total interest
        uint256 userTotalShare = (currentInterest * userStaked) / totalStaked;
        
        // Subtract what they've already claimed
        uint256 alreadyClaimed = userRewards[user].totalClaimed;
        
        // Return claimable amount (total share minus already claimed)
        return userTotalShare > alreadyClaimed ? userTotalShare - alreadyClaimed : 0;
    }
    
    /**
     * @dev Notify when user stakes (called by staking contract)
     * @param user Address of the user who staked
     */
    function notifyStake(address user) external {
        if (msg.sender != address(stakingContract)) {
            return; // Only staking contract can call this
        }
        
        _updateRewardPool();
        _updateUserReward(user);
        userLastStakeTime[user] = block.timestamp;
    }
    
    /**
     * @dev Notify when user unstakes (called by staking contract)
     * @param user Address of the user who unstaked
     */
    function notifyUnstake(address user) external {
        if (msg.sender != address(stakingContract)) {
            return; // Only staking contract can call this
        }
        
        _updateRewardPool();
        _updateUserReward(user);
    }
    
    /**
     * @dev Emergency function to withdraw rewards (only owner)
     * @param amount Amount to withdraw
     */
    function emergencyWithdrawRewards(uint256 amount) external onlyOwner {
        if (amount > address(this).balance) {
            revert InsufficientRewards();
        }
        
        (bool success, ) = payable(owner()).call{value: amount}("");
        if (!success) {
            revert InsufficientRewards();
        }
    }
    
    /**
     * @dev Update minimum claim amount (only owner)
     * @param _minimumClaimAmount New minimum claim amount
     */
    function setMinimumClaimAmount(uint256 _minimumClaimAmount) external onlyOwner {
        minimumClaimAmount = _minimumClaimAmount;
        emit MinimumClaimAmountUpdated(_minimumClaimAmount);
    }
    
    /**
     * @dev Pause contract (only owner)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause contract (only owner)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Get contract balance
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @dev Receive function to accept AVAX deposits for rewards
     */
    receive() external payable {}
}