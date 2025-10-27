// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Escrow por hitos para trabajos freelance
/// @notice Contrato que permite crear jobs con hitos, custodiar fondos, aceptar hitos y resolver disputas por un árbitro.
/// @dev Uso de patrón pull payments y protección básica contra reentrancy.
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/security/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/access/Ownable.sol";

contract EscrowMilestones is ReentrancyGuard, Ownable {
    uint256 public nextJobId;

    enum JobState { Created, Funded, InProgress, Completed, Cancelled }
    enum MilestoneState { Locked, Submitted, Accepted, Disputed, Released, Refunded }

    struct Milestone {
        uint256 amount;
        MilestoneState state;
    }

    struct Job {
        address client;
        address freelancer;
        address arbiter; // can be address(0) meaning no arbiter
        uint256 totalAmount;
        uint256 currentMilestone; // index of next pending milestone (0-based)
        JobState state;
        uint256 milestonesCount;
        mapping(uint256 => Milestone) milestones;
    }

    mapping(uint256 => Job) internal jobs;
    mapping(address => uint256) public pendingWithdrawals;

    event JobCreated(uint256 indexed jobId, address indexed client, address indexed freelancer, address arbiter, uint256 total);
    event JobFunded(uint256 indexed jobId, uint256 amount);
    event MilestoneSubmitted(uint256 indexed jobId, uint256 indexed milestoneIndex);
    event MilestoneAccepted(uint256 indexed jobId, uint256 indexed milestoneIndex, uint256 amount);
    event DisputeRaised(uint256 indexed jobId, uint256 indexed milestoneIndex, address raiser, string reason);
    event DisputeResolved(uint256 indexed jobId, uint256 indexed milestoneIndex, uint8 resolution); // 0 = refund client, 1 = pay freelancer, 2 = split
    event Withdrawn(address indexed who, uint256 amount);

    error NotAuthorized();
    error InvalidState();
    error InsufficientFunds();
    error InvalidMilestone();

    /// @notice Create a job with milestone amounts
    function createJob(address _freelancer, address _arbiter, uint256[] calldata _milestoneAmounts) external returns (uint256 jobId) {
        require(_freelancer != address(0), "Freelancer = 0");
        require(_milestoneAmounts.length > 0, "Need >=1 milestone");

        jobId = nextJobId++;
        Job storage j = jobs[jobId];
        j.client = msg.sender;
        j.freelancer = _freelancer;
        j.arbiter = _arbiter;
        j.state = JobState.Created;
        j.currentMilestone = 0;
        j.milestonesCount = _milestoneAmounts.length;

        uint256 total = 0;
        for (uint256 i = 0; i < _milestoneAmounts.length; i++) {
            require(_milestoneAmounts[i] > 0, "Milestone >0");
            j.milestones[i] = Milestone({ amount: _milestoneAmounts[i], state: MilestoneState.Locked });
            total += _milestoneAmounts[i];
        }
        j.totalAmount = total;

        emit JobCreated(jobId, msg.sender, _freelancer, _arbiter, total);
    }

    /// @notice Fund the job by client, must send exact total
    function fundJob(uint256 jobId) external payable nonReentrant {
        Job storage j = jobs[jobId];
        if (msg.sender != j.client) revert NotAuthorized();
        if (j.state != JobState.Created) revert InvalidState();
        if (msg.value != j.totalAmount) revert InsufficientFunds();

        j.state = JobState.Funded;
        emit JobFunded(jobId, msg.value);
    }

    /// @notice Freelancer submits current milestone
    function submitMilestone(uint256 jobId) external {
        Job storage j = jobs[jobId];
        if (msg.sender != j.freelancer) revert NotAuthorized();
        if (j.state != JobState.Funded && j.state != JobState.InProgress) revert InvalidState();
        uint256 idx = j.currentMilestone;
        if (idx >= j.milestonesCount) revert InvalidMilestone();
        Milestone storage m = j.milestones[idx];
        if (m.state != MilestoneState.Locked) revert InvalidState();

        m.state = MilestoneState.Submitted;
        j.state = JobState.InProgress;
        emit MilestoneSubmitted(jobId, idx);
    }

    /// @notice Client accepts the current submitted milestone, releasing funds to freelancer (pendingWithdrawals)
    function acceptMilestone(uint256 jobId) external nonReentrant {
        Job storage j = jobs[jobId];
        if (msg.sender != j.client) revert NotAuthorized();
        uint256 idx = j.currentMilestone;
        if (idx >= j.milestonesCount) revert InvalidMilestone();
        Milestone storage m = j.milestones[idx];
        if (m.state != MilestoneState.Submitted) revert InvalidState();

        m.state = MilestoneState.Accepted;
        pendingWithdrawals[j.freelancer] += m.amount;

        emit MilestoneAccepted(jobId, idx, m.amount);

        j.currentMilestone = idx + 1;
        if (j.currentMilestone == j.milestonesCount) {
            j.state = JobState.Completed;
        }
    }

    /// @notice Raise dispute on current milestone (either party)
    function raiseDispute(uint256 jobId, string calldata reason) external {
        Job storage j = jobs[jobId];
        uint256 idx = j.currentMilestone;
        if (idx >= j.milestonesCount) revert InvalidMilestone();
        Milestone storage m = j.milestones[idx];
        if (m.state != MilestoneState.Submitted) revert InvalidState();
        if (msg.sender != j.client && msg.sender != j.freelancer) revert NotAuthorized();
        if (j.arbiter == address(0)) revert InvalidState(); // no arbiter set

        m.state = MilestoneState.Disputed;
        emit DisputeRaised(jobId, idx, msg.sender, reason);
    }

    /// @notice Arbiter resolves dispute: resolution 0=refund client, 1=pay freelancer, 2=split 50/50
    function resolveDispute(uint256 jobId, uint8 resolution) external nonReentrant {
        Job storage j = jobs[jobId];
        if (msg.sender != j.arbiter) revert NotAuthorized();
        uint256 idx = j.currentMilestone;
        if (idx >= j.milestonesCount) revert InvalidMilestone();
        Milestone storage m = j.milestones[idx];
        if (m.state != MilestoneState.Disputed) revert InvalidState();

        if (resolution == 0) {
            m.state = MilestoneState.Refunded;
            pendingWithdrawals[j.client] += m.amount;
        } else if (resolution == 1) {
            m.state = MilestoneState.Released;
            pendingWithdrawals[j.freelancer] += m.amount;
        } else if (resolution == 2) {
            // split
            uint256 half = m.amount / 2;
            pendingWithdrawals[j.freelancer] += half;
            pendingWithdrawals[j.client] += (m.amount - half);
            m.state = MilestoneState.Released;
        } else {
            revert();
        }

        emit DisputeResolved(jobId, idx, resolution);

        j.currentMilestone = idx + 1;
        if (j.currentMilestone == j.milestonesCount) {
            j.state = JobState.Completed;
        }
    }

    /// @notice Withdraw accumulated balance
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No funds");
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{ value: amount }("");
        require(ok, "Transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Helpers / getters
    function getJobBasic(uint256 jobId) external view returns (address client, address freelancer, address arbiter, uint256 totalAmount, uint256 currentMilestone, uint256 milestonesCount, JobState state) {
        Job storage j = jobs[jobId];
        return (j.client, j.freelancer, j.arbiter, j.totalAmount, j.currentMilestone, j.milestonesCount, j.state);
    }

    function getMilestone(uint256 jobId, uint256 index) external view returns (uint256 amount, MilestoneState state) {
        Job storage j = jobs[jobId];
        Milestone storage m = j.milestones[index];
        return (m.amount, m.state);
    }

    // Fallback to receive ETH if needed (not used normally)
    receive() external payable {}
}
