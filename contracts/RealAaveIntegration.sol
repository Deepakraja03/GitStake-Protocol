// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./AaveIntegration.sol"; // inherit to remain type-compatible with StakingContract

// Aave v3 interfaces
import { IPoolAddressesProvider } from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import { IPool } from "@aave/core-v3/contracts/interfaces/IPool.sol";
// Minimal interface to avoid extra dependency
interface IWrappedTokenGatewayV3 {
    function depositETH(address pool, address onBehalfOf, uint16 referralCode) external payable;
    function withdrawETH(address pool, uint256 amount, address to) external;
}
import { DataTypes } from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";

/**
 * @title RealAaveIntegration
 * @dev Aave v3-backed implementation compatible with AaveIntegration type.
 *      Uses WrappedNativeGatewayV3 to deposit/withdraw native AVAX to WAVAX reserve on Aave.
 */
contract RealAaveIntegration is AaveIntegration {
    IPool public pool;
    IWrappedTokenGatewayV3 public gateway;
    IERC20 public aToken;          // aToken for WAVAX reserve
    address public reserveAsset;   // WAVAX token address (underlying)

    event AaveConfigured(address provider, address gateway, address reserveAsset, address aToken);

    constructor(
        address addressesProvider,
        address wrappedNativeGateway,
        address reserveAsset_
    ) AaveIntegration() {
        // Initialize Aave pool/gateway
        pool = IPool(IPoolAddressesProvider(addressesProvider).getPool());
        gateway = IWrappedTokenGatewayV3(wrappedNativeGateway);
        reserveAsset = reserveAsset_;
        // Derive aToken address from reserve data on-chain
        DataTypes.ReserveData memory rd = pool.getReserveData(reserveAsset);
        aToken = IERC20(rd.aTokenAddress);

        emit AaveConfigured(addressesProvider, wrappedNativeGateway, reserveAsset_, address(aToken));
    }

    /**
     * @dev Override: deposit native AVAX via gateway into Aave WAVAX reserve
     */
    function depositToAave(uint256 amount) external payable override nonReentrant whenNotPaused {
        if (amount == 0 || msg.value != amount) revert InvalidAmount();

        // Update accrued interest accounting based on current aToken before deposit
        _updateAccruedInterest();

        // Deposit native AVAX using the gateway
        gateway.depositETH{value: amount}(address(pool), address(this), 0);

        // Update internal accounting based on aToken balance
        totalPosition.depositedAmount += amount;
        totalPosition.aTokenBalance = aToken.balanceOf(address(this));
        totalDeposited += amount;

        emit DepositedToAave(amount, block.timestamp);
    }

    /**
     * @dev Override: withdraw native AVAX via gateway back to caller
     */
    function withdrawFromAave(uint256 amount) external override nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();
        if (amount > totalPosition.depositedAmount) revert InsufficientBalance();

        _updateAccruedInterest();

        // Withdraw native AVAX using the gateway; sends to this contract
        // We request 'amount'; any interest stays reflected in aToken balance reduction
        gateway.withdrawETH(address(pool), amount, address(this));

        // Update internal accounting
        totalPosition.depositedAmount -= amount;
        totalPosition.aTokenBalance = aToken.balanceOf(address(this));
        totalDeposited -= amount;

        // Transfer withdrawn amount to caller
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert AaveOperationFailed();

        emit WithdrawnFromAave(amount, block.timestamp);
    }

    /**
     * @dev Override: authorized withdrawal for another contract (e.g., StakingContract)
     */
    function withdrawForContract(uint256 amount, address payable recipient) external override nonReentrant whenNotPaused {
        if (!authorizedContracts[msg.sender]) revert AaveOperationFailed();
        if (amount == 0) revert InvalidAmount();
        if (amount > totalPosition.depositedAmount) revert InsufficientBalance();

        _updateAccruedInterest();

        gateway.withdrawETH(address(pool), amount, address(this));

        totalPosition.depositedAmount -= amount;
        totalPosition.aTokenBalance = aToken.balanceOf(address(this));
        totalDeposited -= amount;

        uint256 sendAmount = amount;
        if (sendAmount > address(this).balance) {
            sendAmount = address(this).balance;
        }
        if (sendAmount > 0) {
            (bool ok, ) = recipient.call{value: sendAmount}("");
            if (!ok) revert AaveOperationFailed();
        }

        emit WithdrawnFromAave(sendAmount, block.timestamp);
    }

    /**
     * @dev Override: compute current interest from aToken growth over principal
     */
    function _calculateCurrentInterest() internal view override returns (uint256) {
        // Actual interest = current aToken balance - principal deposited (bounded)
        uint256 currentATokenBal = aToken.balanceOf(address(this));
        if (currentATokenBal <= totalPosition.depositedAmount) {
            return 0; // no interest yet
        }
        return currentATokenBal - totalPosition.depositedAmount;
    }

    // Accept native withdrawals
    receive() external payable override {}
}

