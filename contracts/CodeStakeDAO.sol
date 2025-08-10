// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./StakingContract.sol";
import "./RewardDistribution.sol";
import "./AaveIntegration.sol";

/**
 * @title CodeStakeDAO
 * @dev Decentralized Autonomous Organization for CodeStake Protocol
 * Governance contract for AI-Enhanced Developer Rewards & Collaboration on Avalanche
 */
contract CodeStakeDAO is ReentrancyGuard, Ownable, Pausable {
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;

    // ============ STRUCTS ============

    struct Proposal {
        uint256 id;
        address proposer;
        ProposalType proposalType;
        string title;
        string description;
        bytes executionData;
        uint256 startTime;
        uint256 endTime;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 totalVotes;
        bool executed;
        bool passed;
        uint256 executionTime;
        mapping(address => Vote) votes;
        string[] additionalMetadata;
    }

    struct Vote {
        bool hasVoted;
        bool support;
        uint256 weight;
        string reason;
        uint256 timestamp;
    }

    struct GitHubRepo {
        string repoUrl;
        address owner;
        bool active;
        uint256 weight;
        string[] allowedContributionTypes;
        uint256 addedTime;
    }

    struct AIChallenge {
        uint256 id;
        string title;
        string description;
        uint256 difficulty; // 1-10
        uint256 rewardMultiplier; // basis points (10000 = 100%)
        bool active;
        uint256 completionCount;
        string[] skills; // Required skills
        uint256 timeLimit; // seconds
    }

    struct DeveloperProfile {
        address developer;
        string githubUsername;
        uint256 totalScore;
        uint256 contributionStreak;
        uint256 lastActivityTime;
        uint256 aiMentorshipUsage;
        uint256[] completedChallenges;
        mapping(string => uint256) skillRatings; // skill -> rating
        bool verified;
        uint256 karmaPoints;
    }

    struct BountyProgram {
        uint256 id;
        string title;
        string description;
        uint256 reward;
        address sponsor;
        bool active;
        uint256 deadline;
        string[] requiredSkills;
        BountyType bountyType;
        uint256 maxParticipants;
        address[] participants;
        bool completed;
        address winner;
    }

    struct TreasuryAllocation {
        uint256 rewardPoolPercentage;
        uint256 developmentFundPercentage;
        uint256 aiInfrastructurePercentage;
        uint256 communityIncentivesPercentage;
        uint256 reservePercentage;
    }

    // ============ ENUMS ============

    enum ProposalType {
        PARAMETER_CHANGE,
        REWARD_ALGORITHM_UPDATE,
        REPO_ADDITION,
        REPO_REMOVAL,
        AI_CHALLENGE_CREATION,
        TREASURY_ALLOCATION,
        PROTOCOL_UPGRADE,
        EMERGENCY_ACTION,
        BOUNTY_CREATION,
        DEVELOPER_VERIFICATION,
        AI_MODEL_UPDATE
    }

    enum BountyType {
        INDIVIDUAL,
        TEAM,
        HACKATHON,
        CODE_REVIEW,
        DOCUMENTATION,
        TESTING
    }

    // ============ STATE VARIABLES ============

    // Core contracts
    StakingContract public stakingContract;
    RewardDistribution public rewardDistribution;
    AaveIntegration public aaveIntegration;

    // DAO parameters
    uint256 public votingDelay = 1 days; // Time before voting starts
    uint256 public votingPeriod = 7 days; // Time for voting
    uint256 public executionDelay = 2 days; // Time before execution after passing
    uint256 public proposalThreshold = 1000 * 1e18; // AVAX needed to create proposal
    uint256 public quorumThreshold = 5000; // Basis points (50%)
    uint256 public passThreshold = 5100; // Basis points (51%)

    // Treasury management
    uint256 public treasuryBalance;
    TreasuryAllocation public treasuryAllocation;
    uint256 public totalTreasuryWithdrawn;

    // Proposal tracking
    uint256 private nextProposalId = 1;
    mapping(uint256 => Proposal) public proposals;
    EnumerableSet.UintSet private activeProposals;

    // GitHub repository management
    mapping(string => GitHubRepo) public githubRepos;
    EnumerableSet.AddressSet private approvedRepoOwners;
    string[] public repoList;

    // AI Challenges
    uint256 private nextChallengeId = 1;
    mapping(uint256 => AIChallenge) public aiChallenges;
    mapping(address => mapping(uint256 => bool)) public challengeCompletions;

    // Developer profiles
    mapping(address => DeveloperProfile) public developerProfiles;
    mapping(string => address) public githubUsernameToAddress;
    EnumerableSet.AddressSet private verifiedDevelopers;

    // Bounty programs
    uint256 private nextBountyId = 1;
    mapping(uint256 => BountyProgram) public bountyPrograms;
    mapping(address => uint256[]) public developerBounties;

    // AI and web search integration
    mapping(string => bool) public approvedAIModels;
    mapping(string => string) public aiModelEndpoints;
    uint256 public aiUsageBudget;
    uint256 public webSearchBudget;

    // Reputation and karma system
    mapping(address => uint256) public reputationScores;
    mapping(address => mapping(address => uint256)) public peerReviews;

    // ============ EVENTS ============

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        ProposalType indexed proposalType,
        string title,
        uint256 startTime,
        uint256 endTime
    );

    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 weight,
        string reason
    );

    event ProposalExecuted(
        uint256 indexed proposalId,
        bool success,
        bytes returnData
    );

    event GitHubRepoAdded(
        string indexed repoUrl,
        address indexed owner,
        uint256 weight
    );

    event GitHubRepoRemoved(string indexed repoUrl);

    event AIChallengeCreated(
        uint256 indexed challengeId,
        string title,
        uint256 difficulty,
        uint256 rewardMultiplier
    );

    event ChallengeCompleted(
        uint256 indexed challengeId,
        address indexed developer,
        uint256 reward
    );

    event DeveloperVerified(
        address indexed developer,
        string githubUsername
    );

    event BountyCreated(
        uint256 indexed bountyId,
        string title,
        uint256 reward,
        address indexed sponsor
    );

    event BountyCompleted(
        uint256 indexed bountyId,
        address indexed winner,
        uint256 reward
    );

    event TreasuryFunded(uint256 amount, address indexed funder);
    event TreasuryWithdrawal(uint256 amount, address indexed recipient, string purpose);

    // ============ MODIFIERS ============

    modifier onlyVerifiedDeveloper() {
        require(verifiedDevelopers.contains(msg.sender), "Not verified developer");
        _;
    }

    modifier onlyStaker() {
        require(stakingContract.userTotalStaked(msg.sender) > 0, "Must be staker");
        _;
    }

    modifier proposalExists(uint256 proposalId) {
        require(proposalId > 0 && proposalId < nextProposalId, "Proposal not found");
        _;
    }

    // ============ CONSTRUCTOR ============

    constructor(
        address _stakingContract,
        address _rewardDistribution,
        address _aaveIntegration
    ) Ownable(msg.sender) {
        stakingContract = StakingContract(payable(_stakingContract));
        rewardDistribution = RewardDistribution(payable(_rewardDistribution));
        aaveIntegration = AaveIntegration(payable(_aaveIntegration));

        // Initialize treasury allocation
        treasuryAllocation = TreasuryAllocation({
            rewardPoolPercentage: 4000, // 40%
            developmentFundPercentage: 2000, // 20%
            aiInfrastructurePercentage: 2000, // 20%
            communityIncentivesPercentage: 1500, // 15%
            reservePercentage: 500 // 5%
        });

        // Set initial AI usage budgets
        aiUsageBudget = 10 ether; // 10 AVAX per month
        webSearchBudget = 5 ether; // 5 AVAX per month
    }

    // ============ PROPOSAL CREATION ============

    /**
     * @dev Create a new governance proposal
     */
    function createProposal(
        ProposalType proposalType,
        string memory title,
        string memory description,
        bytes memory executionData,
        string[] memory additionalMetadata
    ) external onlyStaker nonReentrant returns (uint256) {
        require(stakingContract.userTotalStaked(msg.sender) >= proposalThreshold, "Insufficient stake");
        require(bytes(title).length > 0, "Title required");
        require(bytes(description).length > 0, "Description required");

        uint256 proposalId = nextProposalId++;
        Proposal storage newProposal = proposals[proposalId];
        
        newProposal.id = proposalId;
        newProposal.proposer = msg.sender;
        newProposal.proposalType = proposalType;
        newProposal.title = title;
        newProposal.description = description;
        newProposal.executionData = executionData;
        newProposal.startTime = block.timestamp + votingDelay;
        newProposal.endTime = block.timestamp + votingDelay + votingPeriod;
        newProposal.additionalMetadata = additionalMetadata;

        activeProposals.add(proposalId);

        emit ProposalCreated(
            proposalId,
            msg.sender,
            proposalType,
            title,
            newProposal.startTime,
            newProposal.endTime
        );

        return proposalId;
    }

    // ============ VOTING FUNCTIONS ============

    /**
     * @dev Cast vote on a proposal
     */
    function castVote(
        uint256 proposalId,
        bool support,
        string memory reason
    ) external nonReentrant proposalExists(proposalId) {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp >= proposal.startTime, "Voting not started");
        require(block.timestamp <= proposal.endTime, "Voting ended");
        require(!proposal.votes[msg.sender].hasVoted, "Already voted");

        uint256 votingWeight = _calculateVotingWeight(msg.sender);
        require(votingWeight > 0, "No voting power");

        proposal.votes[msg.sender] = Vote({
            hasVoted: true,
            support: support,
            weight: votingWeight,
            reason: reason,
            timestamp: block.timestamp
        });

        if (support) {
            proposal.votesFor += votingWeight;
        } else {
            proposal.votesAgainst += votingWeight;
        }
        proposal.totalVotes += votingWeight;

        emit VoteCast(proposalId, msg.sender, support, votingWeight, reason);
    }

    /**
     * @dev Execute a passed proposal after execution delay
     */
    function executeProposal(uint256 proposalId) external nonReentrant proposalExists(proposalId) {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp > proposal.endTime, "Voting not ended");
        require(!proposal.executed, "Already executed");

        // Check if proposal passed
        uint256 totalStaked = stakingContract.totalStaked();
        uint256 requiredQuorum = (totalStaked * quorumThreshold) / 10000;
        
        if (proposal.totalVotes >= requiredQuorum) {
            uint256 passVotes = (proposal.totalVotes * passThreshold) / 10000;
            proposal.passed = proposal.votesFor >= passVotes;
        }

        require(proposal.passed, "Proposal failed");
        require(block.timestamp >= proposal.endTime + executionDelay, "Execution delay not met");

        proposal.executed = true;
        proposal.executionTime = block.timestamp;
        activeProposals.remove(proposalId);

        // Execute based on proposal type
        bool success = _executeProposalAction(proposal);

        emit ProposalExecuted(proposalId, success, "");
    }

    // ============ GITHUB REPOSITORY MANAGEMENT ============

    /**
     * @dev Add GitHub repository (via governance or owner)
     */
    function addGitHubRepo(
        string memory repoUrl,
        address repoOwner,
        uint256 weight,
        string[] memory allowedContributionTypes
    ) external {
        require(
            msg.sender == owner() || _isApprovedByGovernance("ADD_REPO", repoUrl),
            "Not authorized"
        );

        githubRepos[repoUrl] = GitHubRepo({
            repoUrl: repoUrl,
            owner: repoOwner,
            active: true,
            weight: weight,
            allowedContributionTypes: allowedContributionTypes,
            addedTime: block.timestamp
        });

        approvedRepoOwners.add(repoOwner);
        repoList.push(repoUrl);

        emit GitHubRepoAdded(repoUrl, repoOwner, weight);
    }

    /**
     * @dev Remove GitHub repository
     */
    function removeGitHubRepo(string memory repoUrl) external onlyOwner {
        require(bytes(githubRepos[repoUrl].repoUrl).length > 0, "Repo not found");
        
        githubRepos[repoUrl].active = false;
        emit GitHubRepoRemoved(repoUrl);
    }

    // ============ AI CHALLENGES ============

    /**
     * @dev Create AI-powered coding challenge
     */
    function createAIChallenge(
        string memory title,
        string memory description,
        uint256 difficulty,
        uint256 rewardMultiplier,
        string[] memory requiredSkills,
        uint256 timeLimit
    ) external onlyOwner returns (uint256) {
        require(difficulty > 0 && difficulty <= 10, "Invalid difficulty");
        require(rewardMultiplier > 0 && rewardMultiplier <= 50000, "Invalid multiplier");

        uint256 challengeId = nextChallengeId++;
        aiChallenges[challengeId] = AIChallenge({
            id: challengeId,
            title: title,
            description: description,
            difficulty: difficulty,
            rewardMultiplier: rewardMultiplier,
            active: true,
            completionCount: 0,
            skills: requiredSkills,
            timeLimit: timeLimit
        });

        emit AIChallengeCreated(challengeId, title, difficulty, rewardMultiplier);
        return challengeId;
    }

    /**
     * @dev Complete AI challenge and claim reward
     */
    function completeAIChallenge(
        uint256 challengeId,
        bytes memory proofData,
        bytes memory aiSignature
    ) external nonReentrant onlyVerifiedDeveloper {
        AIChallenge storage challenge = aiChallenges[challengeId];
        require(challenge.active, "Challenge inactive");
        require(!challengeCompletions[msg.sender][challengeId], "Already completed");

        // Verify AI signature (simplified - in production, verify with AI oracle)
        require(_verifyAISignature(challengeId, proofData, aiSignature), "Invalid proof");

        challengeCompletions[msg.sender][challengeId] = true;
        challenge.completionCount++;

        // Add to developer profile
        developerProfiles[msg.sender].completedChallenges.push(challengeId);
        
        // Calculate reward
        uint256 baseReward = _calculateChallengeReward(challengeId);
        uint256 totalReward = (baseReward * challenge.rewardMultiplier) / 10000;

        // Transfer reward
        require(treasuryBalance >= totalReward, "Insufficient treasury");
        treasuryBalance -= totalReward;
        
        (bool success, ) = payable(msg.sender).call{value: totalReward}("");
        require(success, "Reward transfer failed");

        emit ChallengeCompleted(challengeId, msg.sender, totalReward);
    }

    // ============ DEVELOPER VERIFICATION ============

    /**
     * @dev Verify developer's GitHub profile
     */
    function verifyDeveloper(
        address developer,
        string memory githubUsername,
        bytes memory githubProof
    ) external {
        require(
            msg.sender == owner() || verifiedDevelopers.contains(msg.sender),
            "Not authorized to verify"
        );
        require(developer != address(0), "Invalid address");
        require(bytes(githubUsername).length > 0, "Username required");

        // In production, verify GitHub proof via oracle or signature
        require(_verifyGitHubProof(developer, githubUsername, githubProof), "Invalid GitHub proof");

        // Initialize developer profile fields individually due to mapping
        DeveloperProfile storage profile = developerProfiles[developer];
        profile.developer = developer;
        profile.githubUsername = githubUsername;
        profile.totalScore = 0;
        profile.contributionStreak = 0;
        profile.lastActivityTime = block.timestamp;
        profile.aiMentorshipUsage = 0;
        profile.completedChallenges = new uint256[](0);
        profile.verified = true;
        profile.karmaPoints = 100; // Initial karma

        githubUsernameToAddress[githubUsername] = developer;
        verifiedDevelopers.add(developer);

        emit DeveloperVerified(developer, githubUsername);
    }

    // ============ BOUNTY SYSTEM ============

    /**
     * @dev Create bounty program
     */
    function createBounty(
        string memory title,
        string memory description,
        BountyType bountyType,
        uint256 deadline,
        string[] memory requiredSkills,
        uint256 maxParticipants
    ) external payable nonReentrant {
        require(msg.value > 0, "Bounty reward required");
        require(deadline > block.timestamp, "Invalid deadline");

        uint256 bountyId = nextBountyId++;
        bountyPrograms[bountyId] = BountyProgram({
            id: bountyId,
            title: title,
            description: description,
            reward: msg.value,
            sponsor: msg.sender,
            active: true,
            deadline: deadline,
            requiredSkills: requiredSkills,
            bountyType: bountyType,
            maxParticipants: maxParticipants,
            participants: new address[](0),
            completed: false,
            winner: address(0)
        });

        emit BountyCreated(bountyId, title, msg.value, msg.sender);
    }

    // ============ TREASURY MANAGEMENT ============

    /**
     * @dev Fund the DAO treasury
     */
    function fundTreasury() external payable {
        treasuryBalance += msg.value;
        emit TreasuryFunded(msg.value, msg.sender);
    }

    /**
     * @dev Withdraw from treasury (governance required)
     */
    function withdrawFromTreasury(
        uint256 amount,
        address recipient,
        string memory purpose
    ) external onlyOwner {
        require(amount <= treasuryBalance, "Insufficient treasury");
        require(recipient != address(0), "Invalid recipient");

        treasuryBalance -= amount;
        totalTreasuryWithdrawn += amount;

        (bool success, ) = payable(recipient).call{value: amount}("");
        require(success, "Treasury withdrawal failed");

        emit TreasuryWithdrawal(amount, recipient, purpose);
    }

    // ============ INTERNAL FUNCTIONS ============

    /**
     * @dev Calculate voting weight based on stake and reputation
     */
    function _calculateVotingWeight(address user) internal view returns (uint256) {
        uint256 stakedAmount = stakingContract.userTotalStaked(user);
        uint256 reputation = reputationScores[user];
        
        // Base weight from staked amount
        uint256 baseWeight = stakedAmount / 1e18; // 1 vote per AVAX staked
        
        // Reputation bonus (up to 50% more voting power)
        uint256 reputationBonus = (baseWeight * reputation) / 2000; // max 50% bonus at 1000 reputation
        
        return baseWeight + reputationBonus;
    }

    /**
     * @dev Execute proposal action based on type
     */
    function _executeProposalAction(Proposal storage proposal) internal returns (bool) {
        if (proposal.proposalType == ProposalType.PARAMETER_CHANGE) {
            return _executeParameterChange(proposal.executionData);
        } else if (proposal.proposalType == ProposalType.TREASURY_ALLOCATION) {
            return _executeTreasuryAllocation(proposal.executionData);
        } else if (proposal.proposalType == ProposalType.AI_CHALLENGE_CREATION) {
            return _executeAIChallengeCreation(proposal.executionData);
        }
        // Add more execution types as needed
        return false;
    }

    /**
     * @dev Execute parameter change
     */
    function _executeParameterChange(bytes memory data) internal returns (bool) {
        (string memory param, uint256 value) = abi.decode(data, (string, uint256));
        
        if (keccak256(bytes(param)) == keccak256(bytes("votingPeriod"))) {
            votingPeriod = value;
        } else if (keccak256(bytes(param)) == keccak256(bytes("quorumThreshold"))) {
            quorumThreshold = value;
        } else if (keccak256(bytes(param)) == keccak256(bytes("proposalThreshold"))) {
            proposalThreshold = value;
        }
        
        return true;
    }

    /**
     * @dev Execute treasury allocation change
     */
    function _executeTreasuryAllocation(bytes memory data) internal returns (bool) {
        TreasuryAllocation memory newAllocation = abi.decode(data, (TreasuryAllocation));
        
        // Ensure total equals 10000 (100%)
        uint256 total = newAllocation.rewardPoolPercentage + 
                        newAllocation.developmentFundPercentage + 
                        newAllocation.aiInfrastructurePercentage + 
                        newAllocation.communityIncentivesPercentage + 
                        newAllocation.reservePercentage;
        
        require(total == 10000, "Allocation must total 100%");
        treasuryAllocation = newAllocation;
        return true;
    }

    /**
     * @dev Execute AI challenge creation
     */
    function _executeAIChallengeCreation(bytes memory data) internal returns (bool) {
        (string memory title, string memory description, uint256 difficulty, 
         uint256 rewardMultiplier, string[] memory skills, uint256 timeLimit) = 
         abi.decode(data, (string, string, uint256, uint256, string[], uint256));
        
        return _createAIChallengeInternal(title, description, difficulty, rewardMultiplier, skills, timeLimit) > 0;
    }

    /**
     * @dev Internal function to create AI challenge
     */
    function _createAIChallengeInternal(
        string memory title,
        string memory description,
        uint256 difficulty,
        uint256 rewardMultiplier,
        string[] memory skills,
        uint256 timeLimit
    ) internal returns (uint256) {
        uint256 challengeId = nextChallengeId++;
        aiChallenges[challengeId] = AIChallenge({
            id: challengeId,
            title: title,
            description: description,
            difficulty: difficulty,
            rewardMultiplier: rewardMultiplier,
            active: true,
            completionCount: 0,
            skills: skills,
            timeLimit: timeLimit
        });
        
        return challengeId;
    }

    /**
     * @dev Calculate reward for completing challenge
     */
    function _calculateChallengeReward(uint256 challengeId) internal view returns (uint256) {
        AIChallenge storage challenge = aiChallenges[challengeId];
        
        // Base reward depends on difficulty (1-10 scale)
        uint256 baseReward = challenge.difficulty * 0.1 ether;
        
        // Reduce reward based on completion count (scarcity factor)
        uint256 scarcityFactor = 10000; // Start at 100%
        if (challenge.completionCount > 0) {
            scarcityFactor = 10000 / (1 + (challenge.completionCount / 10));
        }
        
        return (baseReward * scarcityFactor) / 10000;
    }

    /**
     * @dev Verify AI signature (simplified - would use oracle in production)
     */
    function _verifyAISignature(
        uint256 challengeId,
        bytes memory proofData,
        bytes memory signature
    ) internal view returns (bool) {
        // Simplified verification - in production, use AI oracle or trusted signature
        return signature.length > 0 && proofData.length > 0;
    }

    /**
     * @dev Verify GitHub proof (simplified - would use oracle in production)
     */
    function _verifyGitHubProof(
        address developer,
        string memory githubUsername,
        bytes memory proof
    ) internal view returns (bool) {
        // Simplified verification - in production, use GitHub API oracle
        return proof.length > 0 && bytes(githubUsername).length > 0;
    }

    /**
     * @dev Check if action is approved by governance
     */
    function _isApprovedByGovernance(string memory action, string memory param) internal view returns (bool) {
        // Simplified check - in production, check recent proposal approvals
        return false;
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @dev Get proposal details
     */
    function getProposal(uint256 proposalId) external view returns (
        uint256 id,
        address proposer,
        ProposalType proposalType,
        string memory title,
        string memory description,
        uint256 startTime,
        uint256 endTime,
        uint256 votesFor,
        uint256 votesAgainst,
        uint256 totalVotes,
        bool executed,
        bool passed
    ) {
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.id,
            proposal.proposer,
            proposal.proposalType,
            proposal.title,
            proposal.description,
            proposal.startTime,
            proposal.endTime,
            proposal.votesFor,
            proposal.votesAgainst,
            proposal.totalVotes,
            proposal.executed,
            proposal.passed
        );
    }

    /**
     * @dev Get active proposals
     */
    function getActiveProposals() external view returns (uint256[] memory) {
        return activeProposals.values();
    }

    /**
     * @dev Get developer profile
     */
    function getDeveloperProfile(address developer) external view returns (
        string memory githubUsername,
        uint256 totalScore,
        uint256 contributionStreak,
        uint256 lastActivityTime,
        bool verified,
        uint256 karmaPoints,
        uint256[] memory completedChallenges
    ) {
        DeveloperProfile storage profile = developerProfiles[developer];
        return (
            profile.githubUsername,
            profile.totalScore,
            profile.contributionStreak,
            profile.lastActivityTime,
            profile.verified,
            profile.karmaPoints,
            profile.completedChallenges
        );
    }

    /**
     * @dev Get treasury information
     */
    function getTreasuryInfo() external view returns (
        uint256 balance,
        TreasuryAllocation memory allocation,
        uint256 totalWithdrawn
    ) {
        return (treasuryBalance, treasuryAllocation, totalTreasuryWithdrawn);
    }

    /**
     * @dev Get voting weight for user
     */
    function getVotingWeight(address user) external view returns (uint256) {
        return _calculateVotingWeight(user);
    }

    /**
     * @dev Get AI challenge details
     */
    function getAIChallenge(uint256 challengeId) external view returns (
        string memory title,
        string memory description,
        uint256 difficulty,
        uint256 rewardMultiplier,
        bool active,
        uint256 completionCount,
        string[] memory skills,
        uint256 timeLimit
    ) {
        AIChallenge storage challenge = aiChallenges[challengeId];
        return (
            challenge.title,
            challenge.description,
            challenge.difficulty,
            challenge.rewardMultiplier,
            challenge.active,
            challenge.completionCount,
            challenge.skills,
            challenge.timeLimit
        );
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @dev Update DAO parameters (only owner)
     */
    function updateDAOParameters(
        uint256 _votingDelay,
        uint256 _votingPeriod,
        uint256 _executionDelay,
        uint256 _proposalThreshold,
        uint256 _quorumThreshold,
        uint256 _passThreshold
    ) external onlyOwner {
        votingDelay = _votingDelay;
        votingPeriod = _votingPeriod;
        executionDelay = _executionDelay;
        proposalThreshold = _proposalThreshold;
        quorumThreshold = _quorumThreshold;
        passThreshold = _passThreshold;
    }

    /**
     * @dev Pause DAO operations
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause DAO operations
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Emergency withdrawal (only owner, when paused)
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner whenPaused {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Emergency withdrawal failed");
    }

    /**
     * @dev Receive AVAX for treasury funding
     */
    receive() external payable {
        treasuryBalance += msg.value;
        emit TreasuryFunded(msg.value, msg.sender);
    }

    /**
     * @dev Get contract balance
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
