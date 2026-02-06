import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { Erc8004API } from "../../src/erc8004-api";

// Mock PlatformClient
function createMockClient() {
  return {
    get: mock.fn(),
    post: mock.fn(),
    put: mock.fn(),
    delete: mock.fn(),
    rawClient: {
      defaults: { headers: { common: {} }, baseURL: "https://api.openserv.ai" },
    },
    authenticate: mock.fn(),
    workflows: {
      getWallet: mock.fn(),
      get: mock.fn(),
    },
    triggers: {
      getCallableTriggers: mock.fn(),
    },
  };
}

describe("Erc8004API", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let erc8004Api: Erc8004API;

  beforeEach(() => {
    mockClient = createMockClient();
    erc8004Api = new Erc8004API(mockClient as any);
  });

  // ===========================================================================
  // deploy
  // ===========================================================================

  describe("deploy", () => {
    it("should deploy with required fields only", async () => {
      const workflowData = { id: 123, name: "My Workflow", status: "running" };

      mockClient.put.mock.mockImplementation(() =>
        Promise.resolve(workflowData),
      );

      const result = await erc8004Api.deploy({
        workflowId: 123,
        erc8004AgentId: "8453:42",
        stringifiedAgentCard: '{"name":"test"}',
      });

      assert.deepStrictEqual(result, workflowData);
      assert.strictEqual(mockClient.put.mock.callCount(), 1);
      assert.deepStrictEqual(mockClient.put.mock.calls[0].arguments, [
        "/workspaces/123/erc-8004/deploy",
        {
          erc8004AgentId: "8453:42",
          stringifiedAgentCard: '{"name":"test"}',
        },
      ]);
    });

    it("should deploy with all optional fields", async () => {
      const workflowData = { id: 456, name: "Full Deploy" };
      const timestamp = new Date("2025-01-15T10:00:00Z");

      mockClient.put.mock.mockImplementation(() =>
        Promise.resolve(workflowData),
      );

      const result = await erc8004Api.deploy({
        workflowId: 456,
        erc8004AgentId: "8453:99",
        stringifiedAgentCard: '{"name":"full"}',
        latestDeploymentTransactionHash: "0xabc123",
        latestDeploymentTimestamp: timestamp,
        walletAddress: "0xWalletAddress",
        network: "base",
        chainId: 8453,
        rpcUrl: "https://mainnet.base.org",
      });

      assert.deepStrictEqual(result, workflowData);
      assert.deepStrictEqual(mockClient.put.mock.calls[0].arguments, [
        "/workspaces/456/erc-8004/deploy",
        {
          erc8004AgentId: "8453:99",
          stringifiedAgentCard: '{"name":"full"}',
          latestDeploymentTransactionHash: "0xabc123",
          latestDeploymentTimestamp: timestamp,
          walletAddress: "0xWalletAddress",
          network: "base",
          chainId: 8453,
          rpcUrl: "https://mainnet.base.org",
        },
      ]);
    });

    it("should not include workflowId in the request body", async () => {
      mockClient.put.mock.mockImplementation(() => Promise.resolve({}));

      await erc8004Api.deploy({
        workflowId: 789,
        erc8004AgentId: "8453:1",
        stringifiedAgentCard: "{}",
      });

      const [, body] = mockClient.put.mock.calls[0].arguments;
      assert.strictEqual(body.workflowId, undefined);
    });

    it("should not include swap in the request body", async () => {
      mockClient.put.mock.mockImplementation(() => Promise.resolve({}));

      await erc8004Api.deploy({
        workflowId: 789,
        erc8004AgentId: "8453:1",
        stringifiedAgentCard: "{}",
        swap: false,
      });

      const [, body] = mockClient.put.mock.calls[0].arguments;
      assert.strictEqual(body.swap, undefined);
    });

    it("should throw immediately when swap is true", async () => {
      await assert.rejects(
        () =>
          erc8004Api.deploy({
            workflowId: 123,
            erc8004AgentId: "8453:42",
            stringifiedAgentCard: "{}",
            swap: true,
          }),
        (error: Error) => {
          assert.ok(
            error.message.includes(
              "USDC-to-ETH swap for gas is not yet implemented",
            ),
          );
          assert.ok(error.message.includes("coming soon"));
          return true;
        },
      );

      // Should not have called the API at all
      assert.strictEqual(mockClient.put.mock.callCount(), 0);
      assert.strictEqual(mockClient.get.mock.callCount(), 0);
    });

    it("should enrich error with wallet address when deploy fails and wallet exists", async () => {
      mockClient.put.mock.mockImplementation(() =>
        Promise.reject(new Error("insufficient funds for gas")),
      );
      mockClient.workflows.getWallet.mock.mockImplementation(() =>
        Promise.resolve({
          id: "wallet-1",
          deployed: false,
          erc8004AgentId: null,
          stringifiedAgentCard: null,
          address: "0xWorkspaceWalletAddress",
          network: "base",
          chainId: 8453,
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        }),
      );

      await assert.rejects(
        () =>
          erc8004Api.deploy({
            workflowId: 123,
            erc8004AgentId: "8453:42",
            stringifiedAgentCard: "{}",
          }),
        (error: Error) => {
          // Original error is preserved
          assert.ok(error.message.includes("insufficient funds for gas"));
          // Wallet address is surfaced
          assert.ok(error.message.includes("0xWorkspaceWalletAddress"));
          assert.ok(error.message.includes("Send ETH to this address"));
          // Future swap hint
          assert.ok(error.message.includes("swap: true"));
          return true;
        },
      );

      // Should have tried deploy, then fetched wallet
      assert.strictEqual(mockClient.put.mock.callCount(), 1);
      assert.strictEqual(mockClient.workflows.getWallet.mock.callCount(), 1);
      assert.deepStrictEqual(
        mockClient.workflows.getWallet.mock.calls[0].arguments[0],
        { id: 123 },
      );
    });

    it("should enrich error with generate instructions when deploy fails and no wallet exists", async () => {
      mockClient.put.mock.mockImplementation(() =>
        Promise.reject(new Error("transaction reverted")),
      );
      mockClient.workflows.getWallet.mock.mockImplementation(() =>
        Promise.reject(new Error("Not found")),
      );

      await assert.rejects(
        () =>
          erc8004Api.deploy({
            workflowId: 456,
            erc8004AgentId: "8453:1",
            stringifiedAgentCard: "{}",
          }),
        (error: Error) => {
          assert.ok(error.message.includes("transaction reverted"));
          assert.ok(error.message.includes("No wallet found"));
          assert.ok(error.message.includes("generateWallet"));
          assert.ok(error.message.includes("456"));
          return true;
        },
      );
    });
  });

  // ===========================================================================
  // presignIpfsUrl
  // ===========================================================================

  describe("presignIpfsUrl", () => {
    it("should return a presigned IPFS URL", async () => {
      const response = {
        url: "https://uploads.pinata.cloud/v3/files/sign/abc",
      };

      mockClient.put.mock.mockImplementation(() => Promise.resolve(response));

      const result = await erc8004Api.presignIpfsUrl({ workflowId: 123 });

      assert.deepStrictEqual(result, response);
      assert.strictEqual(mockClient.put.mock.callCount(), 1);
      assert.deepStrictEqual(mockClient.put.mock.calls[0].arguments, [
        "/workspaces/123/erc-8004/presign-ipfs-url",
      ]);
    });

    it("should use the correct workflowId in the path", async () => {
      mockClient.put.mock.mockImplementation(() =>
        Promise.resolve({ url: "https://example.com/signed" }),
      );

      await erc8004Api.presignIpfsUrl({ workflowId: 999 });

      assert.strictEqual(
        mockClient.put.mock.calls[0].arguments[0],
        "/workspaces/999/erc-8004/presign-ipfs-url",
      );
    });
  });
});
