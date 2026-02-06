import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { WorkflowsAPI } from "../../src/workflows-api";

// Mock PlatformClient
function createMockClient() {
  return {
    get: mock.fn(),
    post: mock.fn(),
    put: mock.fn(),
    delete: mock.fn(),
    rawClient: { defaults: { headers: { common: {} } } },
  };
}

describe("WorkflowsAPI - Wallet Management", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let workflowsApi: WorkflowsAPI;

  beforeEach(() => {
    mockClient = createMockClient();
    workflowsApi = new WorkflowsAPI(mockClient as any);
  });

  // ===========================================================================
  // getWallet
  // ===========================================================================

  describe("getWallet", () => {
    it("should return the web3 wallet for a workspace", async () => {
      const wallet = {
        id: "wallet-1",
        deployed: true,
        erc8004AgentId: "8453:42",
        stringifiedAgentCard: '{"name":"test"}',
        address: "0x1234567890abcdef1234567890abcdef12345678",
        network: "base",
        chainId: 8453,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-15T10:00:00Z",
      };

      mockClient.get.mock.mockImplementation(() => Promise.resolve(wallet));

      const result = await workflowsApi.getWallet({ id: 123 });

      assert.deepStrictEqual(result, wallet);
      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/workspaces/123/web3",
      ]);
    });

    it("should handle wallet with null fields (not yet deployed)", async () => {
      const wallet = {
        id: "wallet-2",
        deployed: false,
        erc8004AgentId: null,
        stringifiedAgentCard: null,
        address: "0xabcdef1234567890abcdef1234567890abcdef12",
        network: "base",
        chainId: 8453,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      mockClient.get.mock.mockImplementation(() => Promise.resolve(wallet));

      const result = await workflowsApi.getWallet({ id: 456 });

      assert.strictEqual(result.deployed, false);
      assert.strictEqual(result.erc8004AgentId, null);
      assert.strictEqual(result.stringifiedAgentCard, null);
    });
  });

  // ===========================================================================
  // generateWallet
  // ===========================================================================

  describe("generateWallet", () => {
    it("should generate a new web3 wallet", async () => {
      const wallet = {
        id: "wallet-3",
        deployed: false,
        erc8004AgentId: null,
        stringifiedAgentCard: null,
        address: "0xNewGeneratedAddress",
        network: "base",
        chainId: 8453,
        createdAt: "2025-02-01T00:00:00Z",
        updatedAt: "2025-02-01T00:00:00Z",
      };

      mockClient.post.mock.mockImplementation(() => Promise.resolve(wallet));

      const result = await workflowsApi.generateWallet({ id: 123 });

      assert.deepStrictEqual(result, wallet);
      assert.strictEqual(mockClient.post.mock.callCount(), 1);
      assert.deepStrictEqual(mockClient.post.mock.calls[0].arguments, [
        "/workspaces/123/web3/generate",
      ]);
    });
  });

  // ===========================================================================
  // importWallet
  // ===========================================================================

  describe("importWallet", () => {
    it("should import a web3 wallet with correct body", async () => {
      const wallet = {
        id: "wallet-4",
        deployed: false,
        erc8004AgentId: null,
        stringifiedAgentCard: null,
        address: "0xImportedAddress",
        network: "base",
        chainId: 8453,
        createdAt: "2025-02-01T00:00:00Z",
        updatedAt: "2025-02-01T00:00:00Z",
      };

      mockClient.post.mock.mockImplementation(() => Promise.resolve(wallet));

      const result = await workflowsApi.importWallet({
        id: 123,
        address: "0xImportedAddress",
        network: "base",
        chainId: 8453,
        privateKey: "0xPrivateKey123",
      });

      assert.deepStrictEqual(result, wallet);
      assert.strictEqual(mockClient.post.mock.callCount(), 1);
      assert.deepStrictEqual(mockClient.post.mock.calls[0].arguments, [
        "/workspaces/123/web3/import",
        {
          address: "0xImportedAddress",
          network: "base",
          chainId: 8453,
          privateKey: "0xPrivateKey123",
        },
      ]);
    });

    it("should not include id in the request body", async () => {
      mockClient.post.mock.mockImplementation(() => Promise.resolve({}));

      await workflowsApi.importWallet({
        id: 789,
        address: "0xAddr",
        network: "base",
        chainId: 8453,
        privateKey: "0xKey",
      });

      const [, body] = mockClient.post.mock.calls[0].arguments;
      assert.strictEqual(body.id, undefined);
    });
  });

  // ===========================================================================
  // deleteWallet
  // ===========================================================================

  describe("deleteWallet", () => {
    it("should delete the web3 wallet", async () => {
      mockClient.delete.mock.mockImplementation(() => Promise.resolve());

      await workflowsApi.deleteWallet({ id: 123 });

      assert.strictEqual(mockClient.delete.mock.callCount(), 1);
      assert.deepStrictEqual(mockClient.delete.mock.calls[0].arguments, [
        "/workspaces/123/web3",
      ]);
    });

    it("should use the correct id in the path", async () => {
      mockClient.delete.mock.mockImplementation(() => Promise.resolve());

      await workflowsApi.deleteWallet({ id: 777 });

      assert.strictEqual(
        mockClient.delete.mock.calls[0].arguments[0],
        "/workspaces/777/web3",
      );
    });
  });

  // ===========================================================================
  // signFeedbackAuth
  // ===========================================================================

  describe("signFeedbackAuth", () => {
    it("should sign feedback auth for a buyer address", async () => {
      const response = { signature: "0xSignedFeedbackAuth" };

      mockClient.post.mock.mockImplementation(() => Promise.resolve(response));

      const result = await workflowsApi.signFeedbackAuth({
        id: 123,
        buyerAddress: "0xBuyerAddress",
      });

      assert.deepStrictEqual(result, response);
      assert.strictEqual(mockClient.post.mock.callCount(), 1);
      assert.deepStrictEqual(mockClient.post.mock.calls[0].arguments, [
        "/workspaces/123/web3/sign-feedback-auth",
        { buyerAddress: "0xBuyerAddress" },
      ]);
    });

    it("should use the correct id and buyerAddress", async () => {
      mockClient.post.mock.mockImplementation(() =>
        Promise.resolve({ signature: "0xSig" }),
      );

      await workflowsApi.signFeedbackAuth({
        id: 456,
        buyerAddress: "0xAnotherBuyer",
      });

      const [path, body] = mockClient.post.mock.calls[0].arguments;
      assert.strictEqual(path, "/workspaces/456/web3/sign-feedback-auth");
      assert.deepStrictEqual(body, { buyerAddress: "0xAnotherBuyer" });
    });
  });
});
