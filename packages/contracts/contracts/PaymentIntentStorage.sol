// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "./CommonStorage.sol";

contract PaymentIntentStorage is CommonStorage {
    enum RecipientType {
        UNKNOWN,
        QR,
        MOBILE,
        BANK_ACCOUNT,
        WALLET_ID
    }

    enum Preference {
        DEFAULT,
        CHEAPEST,
        FASTEST,
        PREFERRED_PROVIDER
    }

    struct PaymentIntent {
        bytes32 externalReferenceId;
        uint256 amount;
        RecipientType recipientType;
        bytes32 senderHash;
        bytes32 recipientHash;
        bytes32 metadataHash;
        Preference preference;
        uint64 createdAt;
        uint64 deadline;
        IntentStatus status;
        bytes32 chosenProviderRefHash;
        uint8 attempts;
        FailReason lastFailReason;
        bytes32 lastFailDetailHash;
        uint64 lastUpdatedAt;
    }

    struct CreateIntentParams {
        bytes32 externalReferenceId;
        uint256 amount;
        uint64 deadline;
        RecipientType recipientType;
        bytes32 senderHash;
        bytes32 recipientHash;
        bytes32 metadataHash;
        Preference preference;
        bytes32 chosenProviderRefHash;
    }

    struct UpdateIntentParams {
        uint64 deadline;
        IntentStatus status;
        bytes32 chosenProviderRefHash;
        uint8 attempts;
        FailReason lastFailReason;
        bytes32 lastFailDetailHash;
    }
}
