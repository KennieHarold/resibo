// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "./CommonStorage.sol";

contract ReceiptStorage is CommonStorage {
    struct ReceiptProof {
        uint256 intentId;
        bytes32 receiptHash;
        uint16 receiptVersion;
        bytes32 providerRefHash;
        IntentStatus finalStatus;
        FailReason finalReason;
        bytes32 receiptUriHash;
        bytes32 evidenceHash;
        uint64 committedAt;
        address committedBy;
    }

    struct CommitReceiptParams {
        uint256 intentId;
        bytes32 receiptHash;
        uint16 receiptVersion;
        bytes32 providerRefHash;
        IntentStatus finalStatus;
        FailReason finalReason;
        bytes32 receiptUriHash;
        bytes32 evidenceHash;
    }
}
