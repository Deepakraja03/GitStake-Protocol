// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./AaveIntegration.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title EpochPrizePool
 * @notice Epoch-based staking/prize pool with automatic epoch close and
 *         exponential-decay winner weighting. Users deposit AVAX during an epoch;
 *         at epoch end, the total principal plus net yield is distributed to the
 *         top M stakers by stake size with exponential rank weights.
 *
 * Winner-takes-principal variant: non-winners forfeit their stake (no payout).
 */
contract EpochPrizePool is ReentrancyGuard, Ownable, Pausable {
    using EnumerableSet for EnumerableSet.AddressSet;

    // ---------------------------- Config ----------------------------
    AaveIntegration public aave;

    uint256 public epochDuration;        // seconds
    uint256 public feeBps;               // fee on yield only, in basis points

    // Platform fee escrowed in this contract; owner can withdraw
    uint256 public feeEscrowTotal;

    uint256 public numWinners;           // M
    uint256 public decayBps;             // decay factor d in bps (e.g., 6000 => 0.6)

    // ---------------------------- Epoch state ----------------------------
    struct Epoch {
        uint64 startTime;
        uint64 endTime;
        bool closed;
        bool finalized;
        uint256 totalStaked;     // S
        uint256 yieldAmount;     // Y for this epoch (delta vs baseline)
        uint256 feeAmount;       // fee on Y
        uint256 netReward;       // R = Y - fee
        uint256 prizePool;       // P = S + R
        uint256 interestBaseline; // snapshot of aave accruedInterest at epoch start
    }
    // Trusted signer (backend) that attests the winners list for an epoch
    address public winnerSigner;


    // epochId starts from 1
    uint256 public currentEpochId;
    mapping(uint256 => Epoch) public epochs;

    // Per-epoch staking balances and participant set
    mapping(uint256 => mapping(address => uint256)) public stakeOf; // epochId => user => amount
    mapping(uint256 => EnumerableSet.AddressSet) private _participants; // epochId => set of users
    // Per-epoch backend-provided winners (in rank order)
    mapping(uint256 => address[]) public epochWinners;
    mapping(uint256 => bool) public winnersSet;


    // Claimable allocations per epoch (for winners)
    mapping(uint256 => mapping(address => uint256)) public allocationOf; // epochId => user => prize amount

    // ---------------------------- Events ----------------------------
    event ConfigUpdated(uint256 epochDuration, uint256 feeBps, uint256 numWinners, uint256 decayBps);
    event AaveIntegrationSet(address indexed aave);
    event WinnerSignerUpdated(address indexed signer);
    event EpochStarted(uint256 indexed epochId, uint64 startTime, uint64 endTime);
    event Deposited(address indexed user, uint256 indexed epochId, uint256 amount);
    event EpochClosed(uint256 indexed epochId, uint256 S, uint256 Y, uint256 fee, uint256 R, uint256 P);
    event EpochFinalized(uint256 indexed epochId);
    event WinnersSet(uint256 indexed epochId, address[] winners);
    event WinnerPaid(address indexed user, uint256 indexed epochId, uint256 amount);
    event Claimed(address indexed user, uint256 indexed epochId, uint256 amount);
    event FeeWithdrawn(address indexed to, uint256 amount);

    // ---------------------------- Errors ----------------------------
    error InvalidParam();
    error EpochNotOpen();
    error EpochNotFinalized();
    error NothingToClaim();

    constructor(
        AaveIntegration _aave,
        uint256 _epochDuration,
        uint256 _feeBps,
        uint256 _numWinners,
        uint256 _decayBps
    ) Ownable(msg.sender) {
        setAaveIntegration(_aave);
        configure(_epochDuration, _feeBps, _numWinners, _decayBps);
        _startNextEpoch();
    }

    // ---------------------------- Admin ----------------------------

    function setAaveIntegration(AaveIntegration _aave) public onlyOwner {
        if (address(_aave) == address(0)) revert InvalidParam();
        aave = _aave;
        emit AaveIntegrationSet(address(_aave));
    }

    function configure(
        uint256 _epochDuration,
        uint256 _feeBps,
        uint256 _numWinners,
        uint256 _decayBps
    ) public onlyOwner {
        if (_epochDuration == 0 || _feeBps > 10_000 || _numWinners == 0 || _decayBps > 10_000 || _decayBps == 0) {
            revert InvalidParam();
        }
        epochDuration = _epochDuration;
        feeBps = _feeBps;
        numWinners = _numWinners;
        decayBps = _decayBps;
        emit ConfigUpdated(_epochDuration, _feeBps, _numWinners, _decayBps);
    }

    function setWinnerSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert InvalidParam();
        winnerSigner = signer;
        emit WinnerSignerUpdated(signer);
    }


    // Backend submits winners with signature: signer signs keccak256(abi.encode(
    //    epochId, winners[]
    // ))
    function submitWinners(
        uint256 epochId,
        address[] calldata winners,
        bytes calldata signature
    ) external whenNotPaused {
        Epoch storage ep = epochs[epochId];
        require(ep.startTime != 0, "bad epoch");
        require(!winnersSet[epochId], "already set");
        require(winners.length > 0, "no winners");

        // Verify signer (eth_sign over keccak256(abi.encode(...)))
        bytes32 digest = keccak256(abi.encode(address(this), epochId, winners));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        address recovered = ECDSA.recover(ethHash, signature);
        require(recovered == winnerSigner, "bad sig");

        // Store winners in rank order, capped to numWinners
        uint256 m = winners.length;
        if (m > numWinners) m = numWinners;
        address[] storage arr = epochWinners[epochId];
        for (uint256 i = 0; i < m; i++) {
            require(winners[i] != address(0), "zero winner");
            arr.push(winners[i]);
        }
        winnersSet[epochId] = true;
        emit WinnersSet(epochId, winners);
    }


    function pause() external onlyOwner { _pause(); }
    // Owner can withdraw accumulated platform fee (escrow)
    function withdrawFees(uint256 amount, address payable to) external onlyOwner nonReentrant {
        if (amount == 0 || amount > feeEscrowTotal || to == address(0)) revert InvalidParam();
        feeEscrowTotal -= amount;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "fee withdraw failed");
        emit FeeWithdrawn(to, amount);
    }

    function unpause() external onlyOwner { _unpause(); }

    // ---------------------------- Public user actions ----------------------------

    // Payable deposit of AVAX into the current epoch; auto-closes/finalizes when due
    function deposit() external payable nonReentrant whenNotPaused {
        _autoCloseAndFinalizeIfDue();
        Epoch storage ep = epochs[currentEpochId];
        if (block.timestamp >= ep.endTime || ep.closed) revert EpochNotOpen();
        if (msg.value == 0) revert InvalidParam();

        // Track user stake for this epoch
        if (_participants[currentEpochId].add(msg.sender)) {
            // added new participant
        }
        stakeOf[currentEpochId][msg.sender] += msg.value;
        ep.totalStaked += msg.value;

        // Forward to Aave
        aave.depositToAave{value: msg.value}(msg.value);

        emit Deposited(msg.sender, currentEpochId, msg.value);
    }

    // Claim allocated prize for a finalized epoch
    function claim(uint256 epochId) external nonReentrant whenNotPaused {
        _autoCloseAndFinalizeIfDue();
        if (!epochs[epochId].finalized) revert EpochNotFinalized();
        uint256 amt = allocationOf[epochId][msg.sender];
        if (amt == 0) revert NothingToClaim();
        allocationOf[epochId][msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amt}("");
        require(ok, "transfer failed");
        emit WinnerPaid(msg.sender, epochId, amt);
        emit Claimed(msg.sender, epochId, amt);
    }

    // Anyone can poke to close/finalize if due
    function poke() external {
        _autoCloseAndFinalizeIfDue();
    }

    // ---------------------------- Internal epoch lifecycle ----------------------------

    function _startNextEpoch() internal {
        // Update interest then snapshot baseline for the new epoch
        aave.updateInterest();
        uint256 baseline = aave.getAccruedInterest();

        currentEpochId += 1;
        uint64 start = uint64(block.timestamp);
        uint64 end = uint64(start + epochDuration);
        epochs[currentEpochId] = Epoch({
            startTime: start,
            endTime: end,
            closed: false,
            finalized: false,
            totalStaked: 0,
            yieldAmount: 0,
            feeAmount: 0,
            netReward: 0,
            prizePool: 0,
            interestBaseline: baseline
        });
        emit EpochStarted(currentEpochId, start, end);
    }

    function _autoCloseAndFinalizeIfDue() internal {
        Epoch storage ep = epochs[currentEpochId];
        if (!ep.closed && block.timestamp >= ep.endTime) {
            _closeEpoch();
        }
        if (ep.closed && !ep.finalized) {
            _finalizeEpoch();
        }
    }

    // Close epoch: snapshot pool math (Y, fee, R, P). Does not move funds.
    function _closeEpoch() internal {
        Epoch storage ep = epochs[currentEpochId];
        if (ep.closed) return;

        // Update and snapshot interest delta for this epoch
        aave.updateInterest();
        AaveIntegration.AavePosition memory pos = aave.getAavePosition();
        uint256 S = ep.totalStaked;
        uint256 accumulated = pos.accruedInterest;
        uint256 Y = accumulated > ep.interestBaseline ? (accumulated - ep.interestBaseline) : 0;
        uint256 fee = (Y * feeBps) / 10_000;
        uint256 R = Y > fee ? (Y - fee) : 0;
        uint256 P = S + R;

        ep.yieldAmount = Y;
        ep.feeAmount = fee;
        ep.netReward = R;
        ep.prizePool = P;
        ep.closed = true;

        emit EpochClosed(currentEpochId, S, Y, fee, R, P);
    }

    // Finalize epoch: withdraw from Aave, compute winners, assign allocations, send fee, start next epoch
    function _finalizeEpoch() internal nonReentrant {
        Epoch storage ep = epochs[currentEpochId];
        // Require winners list to be set by backend signer before prize assignment
        require(winnersSet[currentEpochId], "winners not set");

        if (!ep.closed || ep.finalized) return;

        // Update interest and withdraw full principal to this contract
        aave.updateInterest();
        uint256 principalOutstanding = aave.getTotalDeposited();
        if (principalOutstanding > 0) {
            aave.withdrawForContract(principalOutstanding, payable(address(this)));
        }

        // Escrow the fee in-contract for owner withdrawal
        if (ep.feeAmount > 0) {
            feeEscrowTotal += ep.feeAmount;
        }

        // Compute winners and allocations based on exponential decay weights combined with stake size
        _assignPrizes(ep.prizePool);

        ep.finalized = true;
        emit EpochFinalized(currentEpochId);

        // Start next epoch immediately
        _startNextEpoch();
    }

    // Allocate prize pool using backend-provided winners (rank order) + exponential decay weighting and stake weighting
    function _assignPrizes(uint256 P) internal {
        uint256 eid = currentEpochId;
        address[] storage winners = epochWinners[eid];
        uint256 m = winners.length;
        if (m == 0 || P == 0) return;

        // Exponential raw weights
        uint256[] memory raw = new uint256[](m);
        uint256 cur = 1e18;
        for (uint256 j = 0; j < m; j++) {
            raw[j] = cur;
            cur = (cur * decayBps) / 10_000;
        }

        // Compute W = sum(raw[j] * stake[winner_j])
        uint256 W = 0;
        uint256[] memory stakes = new uint256[](m);
        for (uint256 j2 = 0; j2 < m; j2++) {
            address w = winners[j2];
            uint256 s = stakeOf[eid][w];
            stakes[j2] = s;
            W += (raw[j2] * s);
        }
        if (W == 0) return;

        // Allocate prizes
        for (uint256 j3 = 0; j3 < m; j3++) {
            uint256 prize = (P * (raw[j3] * stakes[j3])) / W;
            allocationOf[eid][winners[j3]] += prize;
        }
    }

    // ---------------------------- Views & helpers ----------------------------
    function getParticipants(uint256 epochId) external view returns (address[] memory addrs) {
        EnumerableSet.AddressSet storage setRef = _participants[epochId];
        uint256 n = setRef.length();
        addrs = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            addrs[i] = setRef.at(i);
        }
    }

    function getEpoch(uint256 epochId) external view returns (Epoch memory) {
        return epochs[epochId];
    }

    // Receive native AVAX (from Aave withdrawals)
    receive() external payable {}
}
