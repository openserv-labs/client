import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { TriggersAPI } from "../../src/triggers-api";

// Mock PlatformClient
function createMockClient() {
  return {
    get: mock.fn(),
    post: mock.fn(),
    put: mock.fn(),
    delete: mock.fn(),
    rawClient: { defaults: { headers: { common: {} } } },
    authenticate: mock.fn(),
  };
}

describe("TriggersAPI", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let triggersApi: TriggersAPI;

  beforeEach(() => {
    mockClient = createMockClient();
    triggersApi = new TriggersAPI(mockClient as any);
  });

  describe("create", () => {
    it("should create a trigger and return it from list", async () => {
      const triggerId = "trigger-123";
      const triggerFromList = {
        id: triggerId,
        name: "My Webhook",
        integrationConnection: { id: "conn-456" },
        props: { waitForCompletion: true },
        attributes: { uiState: { token: "token-abc" } },
        is_active: false,
        state: "draft",
      };

      mockClient.post.mock.mockImplementation(() =>
        Promise.resolve({ id: triggerId }),
      );
      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ triggers: [triggerFromList] }),
      );

      const result = await triggersApi.create({
        workflowId: 123,
        name: "My Webhook",
        integrationConnectionId: "conn-456",
        props: { waitForCompletion: true },
      });

      assert.strictEqual(result.id, triggerId);
      assert.strictEqual(result.name, "My Webhook");
      assert.strictEqual(result.token, "token-abc");

      // Verify POST call
      const postCall = mockClient.post.mock.calls[0].arguments;
      assert.strictEqual(postCall[0], "/workspaces/123/trigger");
      assert.deepStrictEqual(postCall[1], {
        name: "My Webhook",
        description: "My Webhook", // defaults to name if not provided
        integrationConnectionId: "conn-456",
        props: { waitForCompletion: true },
        attributes: {},
      });
    });

    it("should throw error when no ID returned", async () => {
      mockClient.post.mock.mockImplementation(() => Promise.resolve({}));

      await assert.rejects(
        () =>
          triggersApi.create({
            workflowId: 123,
            name: "Test",
            integrationConnectionId: "conn-123",
          }),
        {
          message: /Trigger creation returned no ID/,
        },
      );
    });
  });

  describe("get", () => {
    it("should get a trigger by ID", async () => {
      const trigger = {
        name: "Test Trigger",
        props: {},
        integrationConnectionId: "conn-123",
      };

      mockClient.get.mock.mockImplementation(() => Promise.resolve(trigger));

      const result = await triggersApi.get({
        workflowId: 123,
        id: "trigger-456",
      });

      assert.strictEqual(result.id, "trigger-456"); // ID is added from params
      assert.strictEqual(result.name, "Test Trigger");
      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/workspaces/123/triggers/trigger-456",
      ]);
    });
  });

  describe("list", () => {
    it("should list triggers from workspace response", async () => {
      const triggers = [
        {
          id: "trigger-1",
          name: "Webhook",
          integrationConnection: { id: "conn-1" },
          props: {},
          attributes: { uiState: { token: "token-1" } },
          is_active: true,
          state: "active",
        },
        {
          id: "trigger-2",
          name: "Cron",
          integrationConnection: { id: "conn-2" },
          props: { schedule: "0 9 * * *" },
          attributes: {},
          is_active: false,
          state: "draft",
        },
      ];

      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ triggers }),
      );

      const result = await triggersApi.list({ workflowId: 123 });

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].id, "trigger-1");
      assert.strictEqual(result[0].token, "token-1");
      assert.strictEqual(result[0].isActive, true);
      assert.strictEqual(result[1].id, "trigger-2");
      assert.strictEqual(result[1].token, undefined);
      assert.strictEqual(result[1].isActive, false);
    });

    it("should handle empty triggers array", async () => {
      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ triggers: [] }),
      );

      const result = await triggersApi.list({ workflowId: 123 });

      assert.deepStrictEqual(result, []);
    });

    it("should handle missing triggers property", async () => {
      mockClient.get.mock.mockImplementation(() => Promise.resolve({}));

      const result = await triggersApi.list({ workflowId: 123 });

      assert.deepStrictEqual(result, []);
    });
  });

  describe("update", () => {
    it("should update a trigger", async () => {
      const existingTrigger = {
        name: "Original",
        description: "Original desc",
        integrationConnectionId: "conn-123",
        props: { timeout: 180 },
      };

      const updatedTrigger = {
        ...existingTrigger,
        name: "Updated",
        props: { timeout: 300 },
      };

      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve(existingTrigger),
      );
      mockClient.put.mock.mockImplementation(() =>
        Promise.resolve(updatedTrigger),
      );

      const result = await triggersApi.update({
        workflowId: 123,
        id: "trigger-456",
        name: "Updated",
        props: { timeout: 300 },
      });

      assert.strictEqual(result.name, "Updated");

      // Verify PUT call preserves existing fields
      const putCall = mockClient.put.mock.calls[0].arguments;
      assert.strictEqual(putCall[0], "/workspaces/123/triggers/trigger-456");
      assert.strictEqual(putCall[1].name, "Updated");
      assert.strictEqual(putCall[1].integrationConnectionId, "conn-123");
    });
  });

  describe("delete", () => {
    it("should delete a trigger", async () => {
      mockClient.delete.mock.mockImplementation(() =>
        Promise.resolve({ success: true }),
      );

      await triggersApi.delete({ workflowId: 123, id: "trigger-456" });

      assert.deepStrictEqual(mockClient.delete.mock.calls[0].arguments, [
        "/workspaces/123/triggers/trigger-456",
      ]);
    });
  });

  describe("activate", () => {
    it("should activate a trigger", async () => {
      const existingTrigger = {
        name: "My Trigger",
        integrationConnectionId: "conn-123",
        props: { timeout: 180 },
      };

      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve(existingTrigger),
      );
      mockClient.put.mock.mockImplementation(() =>
        Promise.resolve({ success: true }),
      );

      await triggersApi.activate({ workflowId: 123, id: "trigger-456" });

      // Verify PUT call includes is_active: true
      const putCall = mockClient.put.mock.calls[0].arguments;
      assert.strictEqual(putCall[0], "/workspaces/123/triggers/trigger-456");
      assert.strictEqual(putCall[1].is_active, true);
      assert.strictEqual(putCall[1].name, "My Trigger");
    });
  });

  describe("fire", () => {
    it("should fire a trigger", async () => {
      mockClient.put.mock.mockImplementation(() =>
        Promise.resolve({ taskId: 1 }),
      );

      const result = await triggersApi.fire({
        workflowId: 123,
        id: "trigger-456",
        input: '{"query": "test"}',
      });

      assert.deepStrictEqual(result, { taskId: 1 });
      assert.deepStrictEqual(mockClient.put.mock.calls[0].arguments, [
        "/workspaces/123/triggers/trigger-456/trigger",
        { input: '{"query": "test"}' },
      ]);
    });

    it("should use empty string for input by default", async () => {
      mockClient.put.mock.mockImplementation(() => Promise.resolve({}));

      await triggersApi.fire({ workflowId: 123, id: "trigger-456" });

      const putCall = mockClient.put.mock.calls[0].arguments;
      assert.strictEqual(putCall[1].input, "");
    });
  });

  describe("fireWebhook", () => {
    it("should fire webhook by workflowId (resolves first non-x402 trigger)", async () => {
      const triggers = [
        {
          id: "trigger-1",
          name: "My Webhook",
          integrationConnection: { id: "conn-1" },
          props: { waitForCompletion: true },
          attributes: { uiState: { token: "webhook-token-abc" } },
          is_active: true,
          state: "active",
        },
      ];

      // list() calls client.get to fetch workspace
      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ triggers }),
      );
      // fireWebhook calls client.post to fire the trigger
      mockClient.post.mock.mockImplementation(() =>
        Promise.resolve({ status: "success" }),
      );

      const result = await triggersApi.fireWebhook({
        workflowId: 123,
        input: { query: "hello world" },
      });

      assert.deepStrictEqual(result, { status: "success" });

      // Verify POST was called with the correct webhook path
      const postCall = mockClient.post.mock.calls[0].arguments;
      assert.strictEqual(postCall[0], "/webhooks/trigger/webhook-token-abc");
      assert.deepStrictEqual(postCall[1], { query: "hello world" });
    });

    it("should fire webhook by direct triggerUrl", async () => {
      mockClient.post.mock.mockImplementation(() =>
        Promise.resolve({ status: "ok" }),
      );

      const result = await triggersApi.fireWebhook({
        triggerUrl: "https://api.openserv.ai/webhooks/trigger/custom-token",
        input: { msg: "test" },
      });

      assert.deepStrictEqual(result, { status: "ok" });

      const postCall = mockClient.post.mock.calls[0].arguments;
      assert.strictEqual(
        postCall[0],
        "https://api.openserv.ai/webhooks/trigger/custom-token",
      );
      assert.deepStrictEqual(postCall[1], { msg: "test" });
    });

    it("should resolve webhook by triggerName", async () => {
      const triggers = [
        {
          id: "trigger-x402",
          name: "Paid Service",
          integrationConnection: { id: "conn-1" },
          props: { x402Pricing: "0.01" },
          attributes: { uiState: { token: "x402-token" } },
          is_active: true,
          state: "active",
        },
        {
          id: "trigger-webhook",
          name: "Free Webhook",
          integrationConnection: { id: "conn-2" },
          props: { waitForCompletion: true },
          attributes: { uiState: { token: "webhook-token-xyz" } },
          is_active: true,
          state: "active",
        },
      ];

      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ triggers }),
      );
      mockClient.post.mock.mockImplementation(() =>
        Promise.resolve({ fired: true }),
      );

      await triggersApi.fireWebhook({
        workflowId: 123,
        triggerName: "Free Webhook",
        input: { data: "test" },
      });

      const postCall = mockClient.post.mock.calls[0].arguments;
      assert.strictEqual(postCall[0], "/webhooks/trigger/webhook-token-xyz");
    });

    it("should resolve webhook by triggerId", async () => {
      const triggers = [
        {
          id: "trigger-a",
          name: "Webhook A",
          integrationConnection: { id: "conn-1" },
          props: {},
          attributes: { uiState: { token: "token-a" } },
          is_active: true,
          state: "active",
        },
        {
          id: "trigger-b",
          name: "Webhook B",
          integrationConnection: { id: "conn-2" },
          props: {},
          attributes: { uiState: { token: "token-b" } },
          is_active: true,
          state: "active",
        },
      ];

      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ triggers }),
      );
      mockClient.post.mock.mockImplementation(() => Promise.resolve({}));

      await triggersApi.fireWebhook({
        workflowId: 123,
        triggerId: "trigger-b",
      });

      const postCall = mockClient.post.mock.calls[0].arguments;
      assert.strictEqual(postCall[0], "/webhooks/trigger/token-b");
    });

    it("should skip x402 triggers when resolving by workflowId", async () => {
      const triggers = [
        {
          id: "trigger-x402",
          name: "Paid",
          integrationConnection: { id: "conn-1" },
          props: { x402Pricing: "0.01" },
          attributes: { uiState: { token: "x402-token" } },
          is_active: true,
          state: "active",
        },
        {
          id: "trigger-webhook",
          name: "Free",
          integrationConnection: { id: "conn-2" },
          props: {},
          attributes: { uiState: { token: "free-token" } },
          is_active: true,
          state: "active",
        },
      ];

      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ triggers }),
      );
      mockClient.post.mock.mockImplementation(() => Promise.resolve({}));

      await triggersApi.fireWebhook({ workflowId: 123 });

      const postCall = mockClient.post.mock.calls[0].arguments;
      assert.strictEqual(postCall[0], "/webhooks/trigger/free-token");
    });

    it("should throw when no workflowId or triggerUrl provided", async () => {
      await assert.rejects(
        () => triggersApi.fireWebhook({ input: { q: "test" } }),
        { message: /Either workflowId or triggerUrl is required/ },
      );
    });

    it("should throw when no webhook trigger found for workflow", async () => {
      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ triggers: [] }),
      );

      await assert.rejects(() => triggersApi.fireWebhook({ workflowId: 999 }), {
        message: /No webhook trigger.*not found.*workflow 999/,
      });
    });

    it("should throw when triggerName not found", async () => {
      const triggers = [
        {
          id: "trigger-1",
          name: "Other Webhook",
          integrationConnection: { id: "conn-1" },
          props: {},
          attributes: { uiState: { token: "token-1" } },
          is_active: true,
          state: "active",
        },
      ];

      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ triggers }),
      );

      await assert.rejects(
        () =>
          triggersApi.fireWebhook({
            workflowId: 123,
            triggerName: "Nonexistent",
          }),
        { message: /Trigger "Nonexistent" not found/ },
      );
    });

    it("should use empty object for input when not provided", async () => {
      const triggers = [
        {
          id: "trigger-1",
          name: "Webhook",
          integrationConnection: { id: "conn-1" },
          props: {},
          attributes: { uiState: { token: "token-1" } },
          is_active: true,
          state: "active",
        },
      ];

      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ triggers }),
      );
      mockClient.post.mock.mockImplementation(() => Promise.resolve({}));

      await triggersApi.fireWebhook({ workflowId: 123 });

      const postCall = mockClient.post.mock.calls[0].arguments;
      assert.deepStrictEqual(postCall[1], {});
    });
  });

  describe("getCallableTriggers", () => {
    it("should return callable triggers for a workspace", async () => {
      const triggers = [
        {
          name: "AI Research",
          description: "Research any topic",
          inputSchema: { prompt: { type: "string" } },
          jsonSchema: { type: "object" },
          webEndpoint: "https://api.openserv.ai/webhooks/x402/trigger/abc",
          httpEndpoint: "https://api.openserv.ai/webhooks/trigger/abc",
        },
        {
          name: "Image Generator",
          description: null,
          inputSchema: {},
          jsonSchema: null,
          webEndpoint: "https://api.openserv.ai/webhooks/x402/trigger/def",
          httpEndpoint: null,
        },
      ];

      mockClient.get.mock.mockImplementation(() => Promise.resolve(triggers));

      const result = await triggersApi.getCallableTriggers({
        workflowId: 123,
      });

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].name, "AI Research");
      assert.strictEqual(result[1].description, null);
      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/workspaces/123/callable-triggers",
      ]);
    });

    it("should return empty array when no callable triggers", async () => {
      mockClient.get.mock.mockImplementation(() => Promise.resolve([]));

      const result = await triggersApi.getCallableTriggers({
        workflowId: 456,
      });

      assert.deepStrictEqual(result, []);
    });
  });
});
