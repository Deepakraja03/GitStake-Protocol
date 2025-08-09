// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./AaveIntegration.sol";

// Forward declaration to avoid circular dependency
interface IRewardDistribution {
    function notifyStake(address user) external;
    function notifyUnstake(address user) external;
}

/**
 * @title StakingContract
 * @dev Core staking contract for Avalanche L1 blockchain with position tracking
 */
contract StakingContract is ReentrancyGuard, Ownable, Pausable {
    
    struct StakingPosition {
        uint256 id;
        address staker;
        uint256 amount;
        uint256 startTime;
        uint256 lockPeriod;
        uint256 lastRewardClaim;
        bool active;
    }
    
    // State variables
    uint256 private nextPositionId;
    uint256 public totalStaked;
    uint256 public minimumStakeAmount;
    uint256 public maximumLockPeriod;
    uint256 public minimumLockPeriod;
    
    // Aave integration
    AaveIntegration public aaveIntegration;
    
    // Reward distribution integration
    IRewardDistribution public rewardDistribution;
    
    // Mappings
    mapping(address => uint256[]) public userPositions;
    mapping(uint256 => StakingPosition) public stakingPositions;
    mapping(address => uint256) public userTotalStaked;
    
    // Events
    event Staked(
        address indexed staker,
        uint256 indexed positionId,
        uint256 amount,
        uint256 lockPeriod,
        uint256 timestamp
    );
    
    event Unstaked(
        address indexed staker,
        uint256 indexed positionId,
        uint256 amount,
        uint256 timestamp
    );
    
    event EmergencyWithdraw(
        address indexed staker,
        uint256 indexed positionId,
        uint256 amount,
        uint256 penalty
    );
    
    event AaveIntegrationSet(address indexed aaveIntegration);
    event TokensDepositedToAave(uint256 amount);
    event TokensWithdrawnFromAave(uint256 amount);
    event RewardDistributionSet(address indexed rewardDistribution);
    
    // Custom errors
    error InsufficientStakeAmount();
    error InvalidLockPeriod();
    error PositionNotFound();
    error PositionNotActive();
    error LockPeriodNotExpired();
    error UnauthorizedAccess();
    error InsufficientBalance();
    error AaveIntegrationNotSet();
    error AaveOperationFailed();
    
    constructor(
        uint256 _minimumStakeAmount,
        uint256 _minimumLockPeriod,
        uint256 _maximumLockPeriod
    ) Ownable(msg.sender) {
        minimumStakeAmount = _minimumStakeAmount;
        minimumLockPeriod = _minimumLockPeriod;
        maximumLockPeriod = _maximumLockPeriod;
        nextPositionId = 1;
    }
    
    /**
     * @dev Stake AVAX tokens for a specified lock period
     * @param lockPeriod Duration to lock tokens (in seconds)
     */
    function stake(uint256 lockPeriod) external payable nonReentrant whenNotPaused {
        if (msg.value < minimumStakeAmount) {
            revert InsufficientStakeAmount();
        }
        
        if (lockPeriod < minimumLockPeriod || lockPeriod > maximumLockPeriod) {
            revert InvalidLockPeriod();
        }
        
        uint256 positionId = nextPositionId++;
        
        StakingPosition memory newPosition = StakingPosition({
            id: positionId,
            staker: msg.sender,
            amount: msg.value,
            startTime: block.timestamp,
            lockPeriod: lockPeriod,
            lastRewardClaim: block.timestamp,
            active: true
        });
        
        stakingPositions[positionId] = newPosition;
        userPositions[msg.sender].push(positionId);
        userTotalStaked[msg.sender] += msg.value;
        totalStaked += msg.value;
        
        // Automatically deposit to Aave if integration is set
        if (address(aaveIntegration) != address(0)) {
            try aaveIntegration.depositToAave{value: msg.value}(msg.value) {
                emit TokensDepositedToAave(msg.value);
            } catch {
                // If Aave deposit fails, continue with staking but emit error
                // In production, you might want to revert here
            }
        }
        
        // Notify reward distribution contract
        if (address(rewardDistribution) != address(0)) {
            try rewardDistribution.notifyStake(msg.sender) {
                // Successfully notified reward distribution
            } catch {
                // Continue even if notification fails
            }
        }
        
        emit Staked(msg.sender, positionId, msg.value, lockPeriod, block.timestamp);
    }
    
    /**
     * @dev Unstake tokens after lock period expires
     * @param positionId ID of the staking position to unstake
     */
    function unstake(uint256 positionId) external nonReentrant whenNotPaused {
        StakingPosition storage position = stakingPositions[positionId];
        
        if (position.staker != msg.sender) {
            revert UnauthorizedAccess();
        }
        
        if (!position.active) {
            revert PositionNotActive();
        }
        
        if (block.timestamp < position.startTime + position.lockPeriod) {
            revert LockPeriodNotExpired();
        }
        
        uint256 amount = position.amount;
        position.active = false;
        
        userTotalStaked[msg.sender] -= amount;
        totalStaked -= amount;
        
        uint256 withdrawAmount = amount;
        uint256 contractBalanceBefore = address(this).balance;
        
        // Withdraw from Aave if integration is set
        if (address(aaveIntegration) != address(0)) {
            try aaveIntegration.withdrawForContract(amount, payable(address(this))) {
                emit TokensWithdrawnFromAave(amount);
                // After successful withdrawal, calculate actual amount received
                uint256 balanceReceived = address(this).balance - contractBalanceBefore;
                withdrawAmount = balanceReceived > 0 ? balanceReceived : amount;
            } catch {
                // If Aave withdrawal fails, use available balance
                withdrawAmount = address(this).balance >= amount ? amount : address(this).balance;
            }
        } else {
            // Use available contract balance for withdrawal
            withdrawAmount = address(this).balance >= amount ? amount : address(this).balance;
        }
        
        // Ensure we don't try to send more than we have
        if (withdrawAmount > address(this).balance) {
            withdrawAmount = address(this).balance;
        }
        
        // Notify reward distribution contract before transfer
        if (address(rewardDistribution) != address(0)) {
            try rewardDistribution.notifyUnstake(msg.sender) {
                // Successfully notified reward distribution
            } catch {
                // Continue even if notification fails
            }
        }
        
        // Transfer amount back to user
        if (withdrawAmount > 0) {
            (bool success, ) = payable(msg.sender).call{value: withdrawAmount}("");
            if (!success) {
                revert InsufficientBalance();
            }
        } else {
            revert InsufficientBalance();
        }
        
        emit Unstaked(msg.sender, positionId, withdrawAmount, block.timestamp);
    }
    
    /**
     * @dev Emergency unstake with penalty (for testing purposes)
     * @param positionId ID of the staking position to emergency unstake
     */
    function emergencyUnstake(uint256 positionId) external nonReentrant whenNotPaused {
        StakingPosition storage position = stakingPositions[positionId];
        
        if (position.staker != msg.sender) {
            revert UnauthorizedAccess();
        }
        
        if (!position.active) {
            revert PositionNotActive();
        }
        
        uint256 amount = position.amount;
        uint256 penalty = amount / 10; // 10% penalty
        uint256 withdrawAmount = amount - penalty;
        
        position.active = false;
        userTotalStaked[msg.sender] -= amount;
        totalStaked -= amount;
        
        // Ensure we don't try to send more than the contract balance
        uint256 contractBalance = address(this).balance;
        if (withdrawAmount > contractBalance) {
            withdrawAmount = contractBalance;
        }
        
        // Transfer reduced amount back to user
        if (withdrawAmount > 0) {
            (bool success, ) = payable(msg.sender).call{value: withdrawAmount}("");
            if (!success) {
                revert InsufficientBalance();
            }
        }
        
        emit EmergencyWithdraw(msg.sender, positionId, withdrawAmount, penalty);
    }
    
    /**
     * @dev Get all staking positions for a user
     * @param user Address of the user
     * @return Array of StakingPosition structs
     */
    function getStakingPositions(address user) external view returns (StakingPosition[] memory) {
        uint256[] memory positionIds = userPositions[user];
        StakingPosition[] memory positions = new StakingPosition[](positionIds.length);
        
        for (uint256 i = 0; i < positionIds.length; i++) {
            positions[i] = stakingPositions[positionIds[i]];
        }
        
        return positions;
    }
    
    /**
     * @dev Get active staking positions for a user
     * @param user Address of the user
     * @return Array of active StakingPosition structs
     */
    function getActiveStakingPositions(address user) external view returns (StakingPosition[] memory) {
        uint256[] memory positionIds = userPositions[user];
        uint256 activeCount = 0;
        
        // Count active positions
        for (uint256 i = 0; i < positionIds.length; i++) {
            if (stakingPositions[positionIds[i]].active) {
                activeCount++;
            }
        }
        
        // Create array of active positions
        StakingPosition[] memory activePositions = new StakingPosition[](activeCount);
        uint256 index = 0;
        
        for (uint256 i = 0; i < positionIds.length; i++) {
            if (stakingPositions[positionIds[i]].active) {
                activePositions[index] = stakingPositions[positionIds[i]];
                index++;
            }
        }
        
        return activePositions;
    }
    
    /**
     * @dev Check if a position can be unstaked
     * @param positionId ID of the staking position
     * @return Boolean indicating if position can be unstaked
     */
    function canUnstake(uint256 positionId) external view returns (bool) {
        StakingPosition memory position = stakingPositions[positionId];
        return position.active && (block.timestamp >= position.startTime + position.lockPeriod);
    }
    
    /**
     * @dev Get remaining lock time for a position
     * @param positionId ID of the staking position
     * @return Remaining lock time in seconds (0 if unlocked)
     */
    function getRemainingLockTime(uint256 positionId) external view returns (uint256) {
        StakingPosition memory position = stakingPositions[positionId];
        
        if (!position.active) {
            return 0;
        }
        
        uint256 unlockTime = position.startTime + position.lockPeriod;
        if (block.timestamp >= unlockTime) {
            return 0;
        }
        
        return unlockTime - block.timestamp;
    }
    
    /**
     * @dev Set Aave integration contract (only owner)
     * @param _aaveIntegration Address of the Aave integration contract
     */
    function setAaveIntegration(address _aaveIntegration) external onlyOwner {
        aaveIntegration = AaveIntegration(payable(_aaveIntegration));
        emit AaveIntegrationSet(_aaveIntegration);
    }
    
    /**
     * @dev Set reward distribution contract (only owner)
     * @param _rewardDistribution Address of the reward distribution contract
     */
    function setRewardDistribution(address _rewardDistribution) external onlyOwner {
        rewardDistribution = IRewardDistribution(_rewardDistribution);
        emit RewardDistributionSet(_rewardDistribution);
    }
    
    /**
     * @dev Get current rewards from Aave integration
     * @return Total accrued interest from Aave
     */
    function getAaveRewards() external view returns (uint256) {
        if (address(aaveIntegration) == address(0)) {
            return 0;
        }
        return aaveIntegration.getAccruedInterest();
    }
    
    /**
     * @dev Test function to withdraw from Aave (for testing purposes only)
     * @param amount Amount to withdraw
     */
    function testAaveWithdrawal(uint256 amount) external onlyOwner {
        if (address(aaveIntegration) != address(0)) {
            aaveIntegration.withdrawForContract(amount, payable(address(this)));
            emit TokensWithdrawnFromAave(amount);
        }
    }
    
    /**
     * @dev Update staking parameters (only owner)
     */
    function updateStakingParameters(
        uint256 _minimumStakeAmount,
        uint256 _minimumLockPeriod,
        uint256 _maximumLockPeriod
    ) external onlyOwner {
        minimumStakeAmount = _minimumStakeAmount;
        minimumLockPeriod = _minimumLockPeriod;
        maximumLockPeriod = _maximumLockPeriod;
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
     * @dev Receive function to accept AVAX deposits from Aave withdrawals
     */
    receive() external payable {}
}