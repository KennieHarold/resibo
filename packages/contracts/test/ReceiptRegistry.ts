import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { keccak256, toHex, zeroHash, getAddress } from "viem";

const IntentStatus = {
  NONE: 0,
  CONFIRMED: 6,
  FAILED: 7,
} as const;

const FailReason = {
  NONE: 0,
  TIMEOUT: 4,
} as const;

describe("ReceiptRegistry", async function () {
  const { viem } = await network.connect();
  const [owner, committer, other] = await viem.getWalletClients();

  function createValidCommitParams(intentId: bigint = 1n) {
    return {
      intentId,
      receiptHash: keccak256(toHex("receipt")),
      receiptVersion: 1,
      providerRefHash: keccak256(toHex("provider-ref")),
      finalStatus: IntentStatus.CONFIRMED,
      finalReason: FailReason.NONE,
      receiptUriHash: keccak256(toHex("receipt-uri")),
      evidenceHash: keccak256(toHex("evidence")),
    };
  }

  async function deployAndSetup() {
    const registry = await viem.deployContract("ReceiptRegistry");
    await registry.write.manageCommitters([committer.account.address, true]);
    return registry;
  }

  // --- Deployment ---

  describe("deployment", async function () {
    it("should set the deployer as owner", async function () {
      const registry = await viem.deployContract("ReceiptRegistry");
      const contractOwner = await registry.read.owner();
      assert.equal(
        getAddress(contractOwner),
        getAddress(owner.account.address),
      );
    });
  });

  // --- manageCommitters ---

  describe("manageCommitters", async function () {
    it("should allow owner to authorize a committer", async function () {
      const registry = await viem.deployContract("ReceiptRegistry");

      await viem.assertions.emitWithArgs(
        registry.write.manageCommitters([committer.account.address, true]),
        registry,
        "CommitterUpdated",
        [getAddress(committer.account.address), true],
      );

      const isAuthorized = await registry.read.authorizedCommitters([
        committer.account.address,
      ]);
      assert.equal(isAuthorized, true);
    });

    it("should allow owner to deauthorize a committer", async function () {
      const registry = await viem.deployContract("ReceiptRegistry");
      await registry.write.manageCommitters([committer.account.address, true]);

      await registry.write.manageCommitters([committer.account.address, false]);

      const isAuthorized = await registry.read.authorizedCommitters([
        committer.account.address,
      ]);
      assert.equal(isAuthorized, false);
    });

    it("should revert when non-owner tries to manage committers", async function () {
      const registry = await viem.deployContract("ReceiptRegistry");

      await assert.rejects(
        registry.write.manageCommitters([committer.account.address, true], {
          account: other.account,
        }),
      );
    });
  });

  // --- commitReceipt ---

  describe("commitReceipt", async function () {
    it("should commit a receipt with valid params and store all fields", async function () {
      const registry = await deployAndSetup();
      const params = createValidCommitParams();

      await registry.write.commitReceipt([params], {
        account: committer.account,
      });

      const receipt = await registry.read.getReceipt([params.intentId]);
      assert.equal(receipt.intentId, params.intentId);
      assert.equal(receipt.receiptHash, params.receiptHash);
      assert.equal(receipt.receiptVersion, params.receiptVersion);
      assert.equal(receipt.providerRefHash, params.providerRefHash);
      assert.equal(receipt.finalStatus, params.finalStatus);
      assert.equal(receipt.finalReason, params.finalReason);
      assert.equal(receipt.receiptUriHash, params.receiptUriHash);
      assert.equal(receipt.evidenceHash, params.evidenceHash);
      assert.equal(
        getAddress(receipt.committedBy),
        getAddress(committer.account.address),
      );
      assert.ok(receipt.committedAt > 0n);
    });

    it("should emit ReceiptCommitted event", async function () {
      const registry = await deployAndSetup();
      const params = createValidCommitParams();

      await viem.assertions.emitWithArgs(
        registry.write.commitReceipt([params], {
          account: committer.account,
        }),
        registry,
        "ReceiptCommitted",
        [
          params.intentId,
          params.receiptHash,
          params.receiptVersion,
          params.providerRefHash,
          params.finalStatus,
          params.finalReason,
        ],
      );
    });

    it("should revert with zero receipt hash", async function () {
      const registry = await deployAndSetup();
      const params = { ...createValidCommitParams(), receiptHash: zeroHash };

      await assert.rejects(
        registry.write.commitReceipt([params], {
          account: committer.account,
        }),
      );
    });

    it("should revert with zero providerRefHash", async function () {
      const registry = await deployAndSetup();
      const params = {
        ...createValidCommitParams(),
        providerRefHash: zeroHash,
      };

      await assert.rejects(
        registry.write.commitReceipt([params], {
          account: committer.account,
        }),
      );
    });

    it("should revert with zero receiptUriHash", async function () {
      const registry = await deployAndSetup();
      const params = { ...createValidCommitParams(), receiptUriHash: zeroHash };

      await assert.rejects(
        registry.write.commitReceipt([params], {
          account: committer.account,
        }),
      );
    });

    it("should revert when called by non-authorized committer", async function () {
      const registry = await deployAndSetup();
      const params = createValidCommitParams();

      await assert.rejects(
        registry.write.commitReceipt([params], {
          account: other.account,
        }),
      );
    });

    it("should overwrite existing receipt for same intentId", async function () {
      const registry = await deployAndSetup();
      const params1 = createValidCommitParams();

      await registry.write.commitReceipt([params1], {
        account: committer.account,
      });

      const updatedReceiptHash = keccak256(toHex("updated-receipt"));
      const params2 = {
        ...createValidCommitParams(),
        receiptHash: updatedReceiptHash,
        receiptVersion: 2,
      };

      await registry.write.commitReceipt([params2], {
        account: committer.account,
      });

      const receipt = await registry.read.getReceipt([1n]);
      assert.equal(receipt.receiptHash, updatedReceiptHash);
      assert.equal(receipt.receiptVersion, 2);
    });

    it("should store receipts for different intentIds independently", async function () {
      const registry = await deployAndSetup();
      const params1 = createValidCommitParams(1n);
      const params2 = {
        ...createValidCommitParams(2n),
        receiptHash: keccak256(toHex("receipt-2")),
      };

      await registry.write.commitReceipt([params1], {
        account: committer.account,
      });
      await registry.write.commitReceipt([params2], {
        account: committer.account,
      });

      const receipt1 = await registry.read.getReceipt([1n]);
      const receipt2 = await registry.read.getReceipt([2n]);

      assert.equal(receipt1.receiptHash, params1.receiptHash);
      assert.equal(receipt2.receiptHash, params2.receiptHash);
      assert.equal(receipt1.intentId, 1n);
      assert.equal(receipt2.intentId, 2n);
    });

    it("should store receipt with FAILED finalStatus", async function () {
      const registry = await deployAndSetup();
      const params = {
        ...createValidCommitParams(),
        finalStatus: IntentStatus.FAILED,
        finalReason: FailReason.TIMEOUT,
      };

      await registry.write.commitReceipt([params], {
        account: committer.account,
      });

      const receipt = await registry.read.getReceipt([params.intentId]);
      assert.equal(receipt.finalStatus, IntentStatus.FAILED);
      assert.equal(receipt.finalReason, FailReason.TIMEOUT);
    });
  });

  // --- getReceipt ---

  describe("getReceipt", async function () {
    it("should return empty receipt for non-existent intentId", async function () {
      const registry = await viem.deployContract("ReceiptRegistry");
      const receipt = await registry.read.getReceipt([999n]);

      assert.equal(receipt.intentId, 0n);
      assert.equal(receipt.receiptHash, zeroHash);
      assert.equal(receipt.committedAt, 0n);
    });
  });
});
