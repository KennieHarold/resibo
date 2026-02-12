// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract CommonStorage {
    enum IntentStatus {
        NONE,
        CREATED,
        QUOTING,
        ROUTED,
        SENT,
        PENDING,
        CONFIRMED,
        FAILED,
        NEEDS_REVIEW,
        CANCELLED
    }

    enum FailReason {
        NONE,
        INVALID_RECIPIENT,
        LIMIT_EXCEEDED,
        PROVIDER_DOWN,
        TIMEOUT,
        DUPLICATE,
        INSUFFICIENT_FUNDS,
        PENDING_TOO_LONG,
        UNSUPPORTED,
        UNKNOWN
    }
}
