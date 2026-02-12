import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { keccak256, toHex, zeroHash, getAddress } from "viem";

const IntentStatus = {
  NONE: 0,
  CREATED: 1,
  QUOTING: 2,
  ROUTED: 3,
  SENT: 4,
  PENDING: 5,
  CONFIRMED: 6,
  FAILED: 7,
  NEEDS_REVIEW: 8,
  CANCELLED: 9,
} as const;

const RecipientType = {
  UNKNOWN: 0,
  QR: 1,
  MOBILE: 2,
  BANK_ACCOUNT: 3,
  WALLET_ID: 4,
} as const;

const Preference = {
  DEFAULT: 0,
  CHEAPEST: 1,
  FASTEST: 2,
  PREFERRED_PROVIDER: 3,
} as const;

const FailReason = {
  NONE: 0,
  INVALID_RECIPIENT: 1,
  LIMIT_EXCEEDED: 2,
  PROVIDER_DOWN: 3,
  TIMEOUT: 4,
  DUPLICATE: 5,
  INSUFFICIENT_FUNDS: 6,
  PENDING_TOO_LONG: 7,
  UNSUPPORTED: 8,
  UNKNOWN: 9,
} as const;

describe("PaymentIntentRegistry", async function () {
  const { viem } = await network.connect();
  const [owner, executor, other] = await viem.getWalletClients();

  function createValidParams() {
    return {
      externalReferenceId: keccak256(toHex("ext-ref-1")),
      amount: 1000n,
      deadline: 3600n,
      recipientType: RecipientType.QR,
      senderHash: keccak256(toHex("sender")),
      recipientHash: keccak256(toHex("recipient")),
      metadataHash: keccak256(toHex("metadata")),
      preference: Preference.DEFAULT,
      chosenProviderRefHash: keccak256(toHex("provider")),
    };
  }

  function createUpdateParams(overrides: Record<string, unknown> = {}) {
    return {
      deadline: 3600n,
      status: IntentStatus.QUOTING,
      chosenProviderRefHash: keccak256(toHex("provider")),
      attempts: 0,
      lastFailReason: FailReason.NONE,
      lastFailDetailHash: zeroHash,
      ...overrides,
    };
  }

  async function deployAndSetup() {
    const registry = await viem.deployContract("PaymentIntentRegistry");
    await registry.write.manageExecutors([executor.account.address, true]);
    return registry;
  }

  async function deployAndCreateIntent() {
    const registry = await deployAndSetup();
    const params = createValidParams();
    await registry.write.createIntent([params], {
      account: executor.account,
    });
    return { registry, intentId: 1n };
  }

  // --- Deployment ---

  describe("deployment", async function () {
    it("should set the deployer as owner", async function () {
      const registry = await viem.deployContract("PaymentIntentRegistry");
      const contractOwner = await registry.read.owner();
      assert.equal(
        getAddress(contractOwner),
        getAddress(owner.account.address),
      );
    });

    it("should initialize currentIntentId to 0", async function () {
      const registry = await viem.deployContract("PaymentIntentRegistry");
      const currentId = await registry.read.currentIntentId();
      assert.equal(currentId, 0n);
    });

    it("should read MIN_DEADLINE constant", async function () {
      const registry = await viem.deployContract("PaymentIntentRegistry");
      const minDeadline = await registry.read.MIN_DEADLINE();
      assert.equal(minDeadline, 1n);
    });
  });

  // --- manageExecutors ---

  describe("manageExecutors", async function () {
    it("should allow owner to authorize an executor", async function () {
      const registry = await viem.deployContract("PaymentIntentRegistry");

      await viem.assertions.emitWithArgs(
        registry.write.manageExecutors([executor.account.address, true]),
        registry,
        "ExecutorUpdated",
        [getAddress(executor.account.address), true],
      );
    });

    it("should allow owner to deauthorize an executor", async function () {
      const registry = await viem.deployContract("PaymentIntentRegistry");
      await registry.write.manageExecutors([executor.account.address, true]);

      await viem.assertions.emitWithArgs(
        registry.write.manageExecutors([executor.account.address, false]),
        registry,
        "ExecutorUpdated",
        [getAddress(executor.account.address), false],
      );
    });

    it("should revert when non-owner tries to manage executors", async function () {
      const registry = await viem.deployContract("PaymentIntentRegistry");

      await assert.rejects(
        registry.write.manageExecutors([executor.account.address, true], {
          account: other.account,
        }),
      );
    });
  });

  // --- createIntent ---

  describe("createIntent", async function () {
    it("should create an intent with valid params and store all fields", async function () {
      const registry = await deployAndSetup();
      const params = createValidParams();

      await registry.write.createIntent([params], {
        account: executor.account,
      });

      const intent = await registry.read.getIntent([1n]);
      assert.equal(intent.externalReferenceId, params.externalReferenceId);
      assert.equal(intent.amount, params.amount);
      assert.equal(intent.recipientType, params.recipientType);
      assert.equal(intent.senderHash, params.senderHash);
      assert.equal(intent.recipientHash, params.recipientHash);
      assert.equal(intent.metadataHash, params.metadataHash);
      assert.equal(intent.preference, params.preference);
      assert.equal(intent.deadline, params.deadline);
      assert.equal(intent.status, IntentStatus.CREATED);
      assert.equal(intent.chosenProviderRefHash, params.chosenProviderRefHash);
      assert.equal(intent.attempts, 0);
      assert.equal(intent.lastFailReason, FailReason.NONE);
      assert.ok(intent.createdAt > 0n);
      assert.ok(intent.lastUpdatedAt > 0n);
    });

    it("should increment currentIntentId", async function () {
      const registry = await deployAndSetup();
      const params = createValidParams();

      await registry.write.createIntent([params], {
        account: executor.account,
      });
      assert.equal(await registry.read.currentIntentId(), 1n);

      await registry.write.createIntent([params], {
        account: executor.account,
      });
      assert.equal(await registry.read.currentIntentId(), 2n);
    });

    it("should emit IntentCreated event", async function () {
      const registry = await deployAndSetup();
      const params = createValidParams();

      await viem.assertions.emitWithArgs(
        registry.write.createIntent([params], {
          account: executor.account,
        }),
        registry,
        "IntentCreated",
        [
          1n,
          params.externalReferenceId,
          params.amount,
          params.senderHash,
          params.recipientType,
          params.recipientHash,
          params.metadataHash,
          params.deadline,
        ],
      );
    });

    it("should revert with zero amount", async function () {
      const registry = await deployAndSetup();
      const params = { ...createValidParams(), amount: 0n };

      await assert.rejects(
        registry.write.createIntent([params], {
          account: executor.account,
        }),
      );
    });

    it("should revert with zero recipient hash", async function () {
      const registry = await deployAndSetup();
      const params = { ...createValidParams(), recipientHash: zeroHash };

      await assert.rejects(
        registry.write.createIntent([params], {
          account: executor.account,
        }),
      );
    });

    it("should revert with zero metadata hash", async function () {
      const registry = await deployAndSetup();
      const params = { ...createValidParams(), metadataHash: zeroHash };

      await assert.rejects(
        registry.write.createIntent([params], {
          account: executor.account,
        }),
      );
    });

    it("should revert with zero chosenProviderRefHash", async function () {
      const registry = await deployAndSetup();
      const params = {
        ...createValidParams(),
        chosenProviderRefHash: zeroHash,
      };

      await assert.rejects(
        registry.write.createIntent([params], {
          account: executor.account,
        }),
      );
    });

    it("should revert with deadline equal to MIN_DEADLINE", async function () {
      const registry = await deployAndSetup();
      const params = { ...createValidParams(), deadline: 1n };

      await assert.rejects(
        registry.write.createIntent([params], {
          account: executor.account,
        }),
      );
    });

    it("should revert with deadline of zero", async function () {
      const registry = await deployAndSetup();
      const params = { ...createValidParams(), deadline: 0n };

      await assert.rejects(
        registry.write.createIntent([params], {
          account: executor.account,
        }),
      );
    });

    it("should revert when called by non-authorized executor", async function () {
      const registry = await deployAndSetup();
      const params = createValidParams();

      await assert.rejects(
        registry.write.createIntent([params], {
          account: other.account,
        }),
      );
    });

    it("should allow deadline just above MIN_DEADLINE", async function () {
      const registry = await deployAndSetup();
      const params = { ...createValidParams(), deadline: 2n };

      await registry.write.createIntent([params], {
        account: executor.account,
      });

      const intent = await registry.read.getIntent([1n]);
      assert.equal(intent.deadline, 2n);
    });
  });

  // --- updateIntentStatus ---

  describe("updateIntentStatus", async function () {
    it("should update intent status and fields", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      const updateParams = createUpdateParams({
        status: IntentStatus.PENDING,
        attempts: 2,
        lastFailReason: FailReason.TIMEOUT,
        lastFailDetailHash: keccak256(toHex("timeout-detail")),
      });

      await registry.write.updateIntentStatus([intentId, updateParams], {
        account: executor.account,
      });

      const intent = await registry.read.getIntent([intentId]);
      assert.equal(intent.status, IntentStatus.PENDING);
      assert.equal(intent.attempts, 2);
      assert.equal(intent.lastFailReason, FailReason.TIMEOUT);
      assert.equal(
        intent.lastFailDetailHash,
        keccak256(toHex("timeout-detail")),
      );
    });

    it("should update lastUpdatedAt", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      const intentBefore = await registry.read.getIntent([intentId]);

      await registry.write.updateIntentStatus(
        [intentId, createUpdateParams()],
        { account: executor.account },
      );

      const intentAfter = await registry.read.getIntent([intentId]);
      assert.ok(intentAfter.lastUpdatedAt >= intentBefore.lastUpdatedAt);
    });

    it("should emit IntentStatusUpdated event", async function () {
      const { registry, intentId } = await deployAndCreateIntent();
      const updateParams = createUpdateParams({
        status: IntentStatus.PENDING,
      });

      await viem.assertions.emitWithArgs(
        registry.write.updateIntentStatus([intentId, updateParams], {
          account: executor.account,
        }),
        registry,
        "IntentStatusUpdated",
        [
          intentId,
          updateParams.status,
          updateParams.chosenProviderRefHash,
          updateParams.lastFailReason,
        ],
      );
    });

    it("should update deadline when provided (> 0)", async function () {
      const { registry, intentId } = await deployAndCreateIntent();
      const updateParams = createUpdateParams({ deadline: 7200n });

      await registry.write.updateIntentStatus([intentId, updateParams], {
        account: executor.account,
      });

      const intent = await registry.read.getIntent([intentId]);
      assert.equal(intent.deadline, 7200n);
    });

    it("should revert when deadline is zero", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await assert.rejects(
        registry.write.updateIntentStatus(
          [intentId, createUpdateParams({ deadline: 0n })],
          { account: executor.account },
        ),
      );
    });

    it("should revert for CONFIRMED intent", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await registry.write.updateIntentStatus(
        [intentId, createUpdateParams({ status: IntentStatus.CONFIRMED })],
        { account: executor.account },
      );

      await assert.rejects(
        registry.write.updateIntentStatus(
          [intentId, createUpdateParams({ status: IntentStatus.QUOTING })],
          { account: executor.account },
        ),
      );
    });

    it("should revert for FAILED intent", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await registry.write.updateIntentStatus(
        [
          intentId,
          createUpdateParams({
            status: IntentStatus.FAILED,
            lastFailReason: FailReason.TIMEOUT,
          }),
        ],
        { account: executor.account },
      );

      await assert.rejects(
        registry.write.updateIntentStatus(
          [intentId, createUpdateParams({ status: IntentStatus.QUOTING })],
          { account: executor.account },
        ),
      );
    });

    it("should revert for CANCELLED intent", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await registry.write.cancelIntent([intentId], {
        account: executor.account,
      });

      await assert.rejects(
        registry.write.updateIntentStatus(
          [intentId, createUpdateParams({ status: IntentStatus.QUOTING })],
          { account: executor.account },
        ),
      );
    });

    it("should revert when called by non-authorized executor", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await assert.rejects(
        registry.write.updateIntentStatus(
          [intentId, createUpdateParams()],
          { account: other.account },
        ),
      );
    });

    it("should allow multiple status transitions through lifecycle", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      // CREATED -> QUOTING
      await registry.write.updateIntentStatus(
        [intentId, createUpdateParams({ status: IntentStatus.QUOTING, deadline: 3600n })],
        { account: executor.account },
      );
      let intent = await registry.read.getIntent([intentId]);
      assert.equal(intent.status, IntentStatus.QUOTING);

      // QUOTING -> ROUTED
      await registry.write.updateIntentStatus(
        [intentId, createUpdateParams({ status: IntentStatus.ROUTED, deadline: 3600n })],
        { account: executor.account },
      );
      intent = await registry.read.getIntent([intentId]);
      assert.equal(intent.status, IntentStatus.ROUTED);

      // ROUTED -> SENT
      await registry.write.updateIntentStatus(
        [intentId, createUpdateParams({ status: IntentStatus.SENT, deadline: 3600n })],
        { account: executor.account },
      );
      intent = await registry.read.getIntent([intentId]);
      assert.equal(intent.status, IntentStatus.SENT);

      // SENT -> CONFIRMED (terminal)
      await registry.write.updateIntentStatus(
        [intentId, createUpdateParams({ status: IntentStatus.CONFIRMED, deadline: 3600n })],
        { account: executor.account },
      );
      intent = await registry.read.getIntent([intentId]);
      assert.equal(intent.status, IntentStatus.CONFIRMED);
    });
  });

  // --- cancelIntent ---

  describe("cancelIntent", async function () {
    it("should cancel a CREATED intent", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await registry.write.cancelIntent([intentId], {
        account: executor.account,
      });

      const intent = await registry.read.getIntent([intentId]);
      assert.equal(intent.status, IntentStatus.CANCELLED);
    });

    it("should update lastUpdatedAt when cancelling", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await registry.write.cancelIntent([intentId], {
        account: executor.account,
      });

      const intent = await registry.read.getIntent([intentId]);
      assert.ok(intent.lastUpdatedAt > 0n);
    });

    it("should emit IntentCancelled event", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await viem.assertions.emitWithArgs(
        registry.write.cancelIntent([intentId], {
          account: executor.account,
        }),
        registry,
        "IntentCancelled",
        [intentId],
      );
    });

    it("should cancel a QUOTING intent", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await registry.write.updateIntentStatus(
        [intentId, createUpdateParams({ status: IntentStatus.QUOTING })],
        { account: executor.account },
      );

      await registry.write.cancelIntent([intentId], {
        account: executor.account,
      });

      const intent = await registry.read.getIntent([intentId]);
      assert.equal(intent.status, IntentStatus.CANCELLED);
    });

    it("should revert for SENT intent", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await registry.write.updateIntentStatus(
        [intentId, createUpdateParams({ status: IntentStatus.SENT })],
        { account: executor.account },
      );

      await assert.rejects(
        registry.write.cancelIntent([intentId], {
          account: executor.account,
        }),
      );
    });

    it("should revert for CONFIRMED intent", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await registry.write.updateIntentStatus(
        [intentId, createUpdateParams({ status: IntentStatus.CONFIRMED })],
        { account: executor.account },
      );

      await assert.rejects(
        registry.write.cancelIntent([intentId], {
          account: executor.account,
        }),
      );
    });

    it("should revert for FAILED intent", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await registry.write.updateIntentStatus(
        [
          intentId,
          createUpdateParams({
            status: IntentStatus.FAILED,
            lastFailReason: FailReason.TIMEOUT,
          }),
        ],
        { account: executor.account },
      );

      await assert.rejects(
        registry.write.cancelIntent([intentId], {
          account: executor.account,
        }),
      );
    });

    it("should revert for already CANCELLED intent", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await registry.write.cancelIntent([intentId], {
        account: executor.account,
      });

      await assert.rejects(
        registry.write.cancelIntent([intentId], {
          account: executor.account,
        }),
      );
    });

    it("should revert when called by non-authorized executor", async function () {
      const { registry, intentId } = await deployAndCreateIntent();

      await assert.rejects(
        registry.write.cancelIntent([intentId], {
          account: other.account,
        }),
      );
    });
  });

  // --- getIntent ---

  describe("getIntent", async function () {
    it("should return correct intent data", async function () {
      const { registry, intentId } = await deployAndCreateIntent();
      const intent = await registry.read.getIntent([intentId]);

      assert.equal(intent.status, IntentStatus.CREATED);
      assert.equal(intent.amount, 1000n);
    });

    it("should return empty intent for non-existent ID", async function () {
      const registry = await viem.deployContract("PaymentIntentRegistry");
      const intent = await registry.read.getIntent([999n]);

      assert.equal(intent.status, IntentStatus.NONE);
      assert.equal(intent.amount, 0n);
      assert.equal(intent.externalReferenceId, zeroHash);
    });
  });
});
