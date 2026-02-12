// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./PaymentIntentStorage.sol";

contract PaymentIntentRegistry is PaymentIntentStorage, Ownable {
    uint256 public constant MIN_DEADLINE = 1 seconds;

    uint256 public currentIntentId;

    mapping(uint256 => PaymentIntent) internal intents;

    mapping(address => bool) internal authorizedExecutors;

    constructor() Ownable(msg.sender) {}

    event IntentCreated(
        uint256 indexed intentId,
        bytes32 indexed externalReferenceId,
        uint256 amount,
        bytes32 senderHash,
        RecipientType recipientType,
        bytes32 recipientHash,
        bytes32 metadataHash,
        uint64 deadline
    );

    event IntentUpdated(
        uint256 indexed intentId,
        IntentStatus status,
        bytes32 chosenProviderRefHash,
        FailReason failReason
    );

    event IntentCancelled(uint256 indexed intentId);

    event ExecutorUpdated(address indexed executor, bool authorized);

    modifier onlyAuthorizedExecutor() {
        require(
            authorizedExecutors[msg.sender],
            "PaymentIntentRegistry: Not an authorized executor"
        );
        _;
    }

    function createIntent(
        CreateIntentParams calldata payload
    ) external onlyAuthorizedExecutor {
        require(
            payload.amount > 0,
            "PaymentIntentRegistry::createIntent: Invalid amount"
        );
        require(
            payload.recipientHash != bytes32(0) &&
                payload.metadataHash != bytes32(0) &&
                payload.chosenProviderRefHash != bytes32(0),
            "PaymentIntentRegistry::createIntent: Invalid hash"
        );
        require(
            payload.deadline > MIN_DEADLINE,
            "PaymentIntentRegistry::createIntent: Deadline too small"
        );

        uint256 intentId = ++currentIntentId;

        PaymentIntent storage intent = intents[intentId];
        intent.externalReferenceId = payload.externalReferenceId;
        intent.senderHash = payload.senderHash;
        intent.amount = payload.amount;
        intent.recipientType = payload.recipientType;
        intent.recipientHash = payload.recipientHash;
        intent.metadataHash = payload.metadataHash;
        intent.preference = payload.preference;
        intent.createdAt = uint64(block.timestamp);
        intent.deadline = payload.deadline;
        intent.status = IntentStatus.CREATED;
        intent.chosenProviderRefHash = payload.chosenProviderRefHash;
        intent.lastUpdatedAt = uint64(block.timestamp);

        emit IntentCreated(
            intentId,
            payload.externalReferenceId,
            payload.amount,
            payload.senderHash,
            payload.recipientType,
            payload.recipientHash,
            payload.metadataHash,
            payload.deadline
        );
    }

    function updateIntent(
        uint256 intentId,
        UpdateIntentParams calldata payload
    ) external onlyAuthorizedExecutor {
        PaymentIntent storage intent = intents[intentId];

        require(
            payload.deadline > MIN_DEADLINE,
            "PaymentIntentRegistry::updateIntent: Deadline too small"
        );

        require(
            payload.chosenProviderRefHash != bytes32(0),
            "PaymentIntentRegistry::updateIntent: Invalid hash"
        );

        require(
            intent.status != IntentStatus.CONFIRMED &&
                intent.status != IntentStatus.FAILED &&
                intent.status != IntentStatus.CANCELLED,
            "PaymentIntentRegistry::updateIntent: Intent is in terminal status"
        );

        intent.status = payload.status;
        intent.chosenProviderRefHash = payload.chosenProviderRefHash;
        intent.attempts = payload.attempts;
        intent.lastFailReason = payload.lastFailReason;
        intent.lastFailDetailHash = payload.lastFailDetailHash;
        intent.lastUpdatedAt = uint64(block.timestamp);
        intent.deadline = payload.deadline;

        emit IntentUpdated(
            intentId,
            payload.status,
            payload.chosenProviderRefHash,
            payload.lastFailReason
        );
    }

    function cancelIntent(uint256 intentId) external onlyAuthorizedExecutor {
        PaymentIntent storage intent = intents[intentId];

        require(
            intent.status != IntentStatus.SENT &&
                intent.status != IntentStatus.CONFIRMED &&
                intent.status != IntentStatus.FAILED &&
                intent.status != IntentStatus.CANCELLED,
            "PaymentIntentRegistry::cancelIntent: Intent cannot be cancelled"
        );

        intent.status = IntentStatus.CANCELLED;
        intent.lastUpdatedAt = uint64(block.timestamp);

        emit IntentCancelled(intentId);
    }

    function manageExecutors(
        address executor,
        bool authorized
    ) external onlyOwner {
        authorizedExecutors[executor] = authorized;

        emit ExecutorUpdated(executor, authorized);
    }

    function getIntent(
        uint256 intentId
    ) external view returns (PaymentIntent memory) {
        return intents[intentId];
    }
}
