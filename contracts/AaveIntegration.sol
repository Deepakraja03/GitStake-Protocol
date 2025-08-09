// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AaveIntegration
 * @dev Contract to handle deposits and withdrawals from Aave lending pools
 */
contract AaveIntegration is ReentrancyGuard, Ownable, Pausable {
    
    // Aave position tracking
    struct AavePosition {
        uint256 depositedAmount;
        uint256 aTokenBalance;
        uint256 accruedInterest;
        uint256 lastInterestUpdate;
    }
    
    // State variables
    AavePosition public totalPosition;
    uint256 public totalDeposited;
    uint256 public totalInterestEarned;
    uint256 public lastInterestCalculation;
    
    // Authorized contracts that can call withdraw
    mapping(address => bool) public authorizedContracts;
    
    // Mock Aave interfaces for testing (will be replaced with actual Aave contracts)
    address public mockLendingPool;
    address public mockAToken;
    
    // Events
    event DepositedToAave(uint256 amount, uint256 timestamp);
    event WithdrawnFromAave(uint256 amount, uint256 timestamp);
    event InterestUpdated(uint256 newInterest, uint256 timestamp);
    event AaveContractsUpdated(address lendingPool, address aToken);
    event AuthorizedContractAdded(address indexed contractAddress);
    event AuthorizedContractRemoved(address indexed contractAddress);
    
    // Custom errors
    error InsufficientBalance();
    error InvalidAmount();
    error AaveOperationFailed();
    error ContractNotSet();
    
    constructor() Ownable(msg.sender) {
        lastInterestCalculation = block.timestamp;
    }
    
    /**
     * @dev Set Aave contract addresses (for testing and configuration)
     * @param _lendingPool Address of Aave lending pool
     * @param _aToken Address of aAVAX token
     */
    function setAaveContracts(address _lendingPool, address _aToken) external onlyOwner {
        mockLendingPool = _lendingPool;
        mockAToken = _aToken;
        emit AaveContractsUpdated(_lendingPool, _aToken);
    }
    
    /**
     * @dev Add authorized contract that can withdraw funds
     * @param contractAddress Address of the contract to authorize
     */
    function addAuthorizedContract(address contractAddress) external onlyOwner {
        authorizedContracts[contractAddress] = true;
        emit AuthorizedContractAdded(contractAddress);
    }
    
    /**
     * @dev Remove authorized contract
     * @param contractAddress Address of the contract to remove authorization
     */
    function removeAuthorizedContract(address contractAddress) external onlyOwner {
        authorizedContracts[contractAddress] = false;
        emit AuthorizedContractRemoved(contractAddress);
    }
    
    /**
     * @dev Deposit AVAX to Aave lending pool
     * @param amount Amount of AVAX to deposit
     */
    function depositToAave(uint256 amount) external payable virtual nonReentrant whenNotPaused {
        if (amount == 0 || msg.value != amount) {
            revert InvalidAmount();
        }
        
        // Update interest before new deposit
        _updateAccruedInterest();
        
        // For testing purposes, we'll simulate Aave deposit
        // In production, this would interact with actual Aave contracts
        _simulateAaveDeposit(amount);
        
        totalPosition.depositedAmount += amount;
        totalPosition.aTokenBalance += amount; // 1:1 ratio for simplicity
        totalDeposited += amount;
        
        emit DepositedToAave(amount, block.timestamp);
    }
    
    /**
     * @dev Withdraw AVAX from Aave lending pool
     * @param amount Amount of AVAX to withdraw
     */
    function withdrawFromAave(uint256 amount) external virtual nonReentrant whenNotPaused {
        if (amount == 0) {
            revert InvalidAmount();
        }
        
        if (amount > totalPosition.depositedAmount) {
            revert InsufficientBalance();
        }
        
        // Update interest before withdrawal
        _updateAccruedInterest();
        
        // For testing purposes, we'll simulate Aave withdrawal
        // In production, this would interact with actual Aave contracts
        uint256 withdrawnAmount = _simulateAaveWithdrawal(amount);
        
        totalPosition.depositedAmount -= amount;
        totalPosition.aTokenBalance -= amount;
        totalDeposited -= amount;
        
        // Transfer withdrawn amount to caller
        (bool success, ) = payable(msg.sender).call{value: withdrawnAmount}("");
        if (!success) {
            revert AaveOperationFailed();
        }
        
        emit WithdrawnFromAave(withdrawnAmount, block.timestamp);
    }
    
    /**
     * @dev Withdraw AVAX from Aave for authorized contracts (like StakingContract)
     * @param amount Amount of AVAX to withdraw
     * @param recipient Address to send the withdrawn funds to
     */
    function withdrawForContract(uint256 amount, address payable recipient) external virtual nonReentrant whenNotPaused {
        if (!authorizedContracts[msg.sender]) {
            revert AaveOperationFailed();
        }
        
        if (amount == 0) {
            revert InvalidAmount();
        }
        
        if (amount > totalPosition.depositedAmount) {
            revert InsufficientBalance();
        }
        
        // Update interest before withdrawal
        _updateAccruedInterest();
        
        // For testing purposes, we'll simulate Aave withdrawal
        uint256 withdrawnAmount = _simulateAaveWithdrawal(amount);
        
        totalPosition.depositedAmount -= amount;
        totalPosition.aTokenBalance -= amount;
        totalDeposited -= amount;
        
        // Ensure we don't try to send more than the contract balance
        uint256 actualWithdrawAmount = withdrawnAmount;
        if (actualWithdrawAmount > address(this).balance) {
            // If we don't have enough balance, just send what we have
            actualWithdrawAmount = address(this).balance;
        }
        
        // Transfer withdrawn amount to recipient
        if (actualWithdrawAmount > 0) {
            (bool success, ) = recipient.call{value: actualWithdrawAmount}("");
            if (!success) {
                revert AaveOperationFailed();
            }
        }
        
        emit WithdrawnFromAave(withdrawnAmount, block.timestamp);
    }
    
    /**
     * @dev Get current accrued interest from Aave
     * @return Current accrued interest amount
     */
    function getAccruedInterest() external view returns (uint256) {
        return _calculateCurrentInterest();
    }
    
    /**
     * @dev Get current aToken balance
     * @return Current aToken balance
     */
    function getATokenBalance() external view returns (uint256) {
        return totalPosition.aTokenBalance;
    }
    
    /**
     * @dev Get total deposited amount
     * @return Total amount deposited to Aave
     */
    function getTotalDeposited() external view returns (uint256) {
        return totalPosition.depositedAmount;
    }
    
    /**
     * @dev Get detailed Aave position information
     * @return AavePosition struct with all position details
     */
    function getAavePosition() external view returns (AavePosition memory) {
        AavePosition memory currentPosition = totalPosition;
        currentPosition.accruedInterest = _calculateCurrentInterest();
        return currentPosition;
    }
    
    /**
     * @dev Update accrued interest calculation
     */
    function updateInterest() external {
        _updateAccruedInterest();
    }
    
    /**
     * @dev Internal function to update accrued interest
     */
    function _updateAccruedInterest() internal {
        uint256 newInterest = _calculateCurrentInterest();
        totalPosition.accruedInterest = newInterest;
        totalPosition.lastInterestUpdate = block.timestamp;
        totalInterestEarned = newInterest;
        lastInterestCalculation = block.timestamp;
        
        emit InterestUpdated(newInterest, block.timestamp);
    }
    
    /**
     * @dev Calculate current interest based on time elapsed and deposit amount
     * @return Calculated interest amount
     */
    function _calculateCurrentInterest() internal view virtual returns (uint256) {
        if (totalPosition.depositedAmount == 0) {
            return totalPosition.accruedInterest;
        }
        
        uint256 timeElapsed = block.timestamp - lastInterestCalculation;
        // Simulate 5% APY (simplified calculation for testing)
        // In production, this would query actual Aave interest rates
        uint256 annualRate = 5; // 5%
        uint256 secondsInYear = 365 * 24 * 60 * 60;
        
        uint256 newInterest = (totalPosition.depositedAmount * annualRate * timeElapsed) / (100 * secondsInYear);
        return totalPosition.accruedInterest + newInterest;
    }
    
    /**
     * @dev Simulate Aave deposit (for testing purposes)
     * @param amount Amount to deposit
     */
    function _simulateAaveDeposit(uint256 amount) internal {
        // In production, this would call:
        // ILendingPool(mockLendingPool).deposit(asset, amount, address(this), 0);
        // For now, we just hold the AVAX in this contract
    }
    
    /**
     * @dev Simulate Aave withdrawal (for testing purposes)
     * @param amount Amount to withdraw
     * @return Actual amount withdrawn (including interest)
     */
    function _simulateAaveWithdrawal(uint256 amount) internal view returns (uint256) {
        // In production, this would call:
        // ILendingPool(mockLendingPool).withdraw(asset, amount, address(this));
        
        // Calculate proportional interest to include in withdrawal
        uint256 interestShare = 0;
        if (totalPosition.depositedAmount > 0) {
            interestShare = (totalPosition.accruedInterest * amount) / totalPosition.depositedAmount;
        }
        
        return amount + interestShare;
    }
    
    /**
     * @dev Emergency withdrawal function (only owner)
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        if (amount > address(this).balance) {
            revert InsufficientBalance();
        }
        
        (bool success, ) = payable(owner()).call{value: amount}("");
        if (!success) {
            revert AaveOperationFailed();
        }
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
     * @dev Receive function to accept AVAX deposits
     */
    receive() external payable virtual {}
}