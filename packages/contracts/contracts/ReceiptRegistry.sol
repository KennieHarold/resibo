// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ReceiptStorage.sol";

contract ReceiptRegistry is ReceiptStorage, Ownable {
    mapping(uint256 => ReceiptProof) internal receipts;

    mapping(address => bool) public authorizedCommitters;

    constructor() Ownable(msg.sender) {}

    event ReceiptCommitted(
        uint256 indexed intentId,
        bytes32 receiptHash,
        uint16 receiptVersion,
        bytes32 providerRefHash,
        IntentStatus finalStatus,
        FailReason finalReason
    );

    event CommitterUpdated(address indexed committer, bool authorized);

    modifier onlyAuthorizedCommitter() {
        require(
            authorizedCommitters[msg.sender],
            "ReceiptRegistry: Not an authorized committer"
        );
        _;
    }

    function commitReceipt(
        CommitReceiptParams calldata payload
    ) external onlyAuthorizedCommitter {
        require(
            payload.receiptHash != bytes32(0) &&
                payload.providerRefHash != bytes32(0) &&
                payload.receiptUriHash != bytes32(0),
            "ReceiptRegistry::commitReceipt: Invalid hash"
        );

        ReceiptProof storage receipt = receipts[payload.intentId];

        receipt.intentId = payload.intentId;
        receipt.receiptHash = payload.receiptHash;
        receipt.receiptVersion = payload.receiptVersion;
        receipt.providerRefHash = payload.providerRefHash;
        receipt.finalStatus = payload.finalStatus;
        receipt.finalReason = payload.finalReason;
        receipt.receiptUriHash = payload.receiptUriHash;
        receipt.evidenceHash = payload.evidenceHash;
        receipt.committedAt = uint64(block.timestamp);
        receipt.committedBy = msg.sender;

        emit ReceiptCommitted(
            payload.intentId,
            payload.receiptHash,
            payload.receiptVersion,
            payload.providerRefHash,
            payload.finalStatus,
            payload.finalReason
        );
    }

    function manageCommitters(
        address committer,
        bool authorized
    ) external onlyOwner {
        authorizedCommitters[committer] = authorized;

        emit CommitterUpdated(committer, authorized);
    }

    function getReceipt(
        uint256 intentId
    ) external view returns (ReceiptProof memory) {
        return receipts[intentId];
    }
}
