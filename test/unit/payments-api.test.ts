import { describe, it, beforeEach, mock, afterEach } from "node:test";
import assert from "node:assert";
import { PaymentsAPI } from "../../src/payments-api";

// Mock PlatformClient (with triggers sub-API for workflowId resolution)
function createMockClient() {
  return {
    get: mock.fn(),
    post: mock.fn(),
    put: mock.fn(),
    delete: mock.fn(),
    rawClient: {
      defaults: {
        baseURL: "https://api.openserv.ai",
        headers: { common: {} },
      },
    },
    authenticate: mock.fn(),
    triggers: {
      list: mock.fn(),
    },
  };
}

// Store original fetch and env
const originalFetch = globalThis.fetch;
const originalEnv = process.env.WALLET_PRIVATE_KEY;

describe("PaymentsAPI", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let paymentsApi: PaymentsAPI;

  beforeEach(() => {
    mockClient = createMockClient();
    paymentsApi = new PaymentsAPI(mockClient as any);
    // Clear env var for clean tests
    delete process.env.WALLET_PRIVATE_KEY;
  });

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.WALLET_PRIVATE_KEY = originalEnv;
    } else {
      delete process.env.WALLET_PRIVATE_KEY;
    }
  });

  describe("payWorkflow", () => {
    it("should throw error when no private key provided", async () => {
      await assert.rejects(
        () =>
          paymentsApi.payWorkflow({
            triggerUrl: "https://api.openserv.ai/webhooks/x402/trigger/abc123",
            input: { prompt: "test" },
          }),
        {
          message:
            "Private key is required. Provide it as a parameter or set WALLET_PRIVATE_KEY env var.",
        },
      );
    });

    it("should use WALLET_PRIVATE_KEY from environment", async () => {
      // Set env var - use a valid 32-byte hex private key
      process.env.WALLET_PRIVATE_KEY =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      // Mock the x402-fetch behavior by mocking global fetch
      // The wrapFetchWithPayment will call fetch internally
      let fetchCalled = false;
      let fetchUrl = "";
      let fetchOptions: RequestInit | undefined;

      globalThis.fetch = mock.fn(async (url: string, options?: RequestInit) => {
        fetchCalled = true;
        fetchUrl = url;
        fetchOptions = options;
        return new Response(
          JSON.stringify({ status: "success", output: "result" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }) as typeof fetch;

      const result = await paymentsApi.payWorkflow({
        triggerUrl: "https://api.openserv.ai/webhooks/x402/trigger/abc123",
        input: { prompt: "test" },
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.network, "base");
      assert.strictEqual(result.chainId, 8453);
      assert.deepStrictEqual(result.response, {
        status: "success",
        output: "result",
      });
      assert.strictEqual(fetchCalled, true);
      assert.strictEqual(
        fetchUrl,
        "https://api.openserv.ai/webhooks/x402/trigger/abc123",
      );
      assert.strictEqual(fetchOptions?.method, "POST");
    });

    it("should use provided private key over environment", async () => {
      // Set env var
      process.env.WALLET_PRIVATE_KEY =
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

      // Mock fetch
      let requestBody = "";
      globalThis.fetch = mock.fn(
        async (_url: string, options?: RequestInit) => {
          requestBody = options?.body as string;
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      ) as typeof fetch;

      // Use different private key in params
      const providedKey =
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

      await paymentsApi.payWorkflow({
        triggerUrl: "https://api.openserv.ai/webhooks/x402/trigger/abc123",
        privateKey: providedKey,
        input: { data: "test" },
      });

      // The buyerAddress in the request body should match the provided key's address
      const parsed = JSON.parse(requestBody);
      assert.ok(parsed.buyerAddress);
      // Address derived from 0xbbbb... key (actual derived address)
      assert.strictEqual(
        parsed.buyerAddress.toLowerCase(),
        "0x88f9b82462f6c4bf4a0fb15e5c3971559a316e7f",
      );
    });

    it("should throw error on non-ok response", async () => {
      process.env.WALLET_PRIVATE_KEY =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      // Return a 500 error (not 402, which x402-fetch tries to handle specially)
      globalThis.fetch = mock.fn(async () => {
        return new Response(JSON.stringify({ error: "Server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await assert.rejects(
        () =>
          paymentsApi.payWorkflow({
            triggerUrl: "https://api.openserv.ai/webhooks/x402/trigger/abc123",
            input: { prompt: "test" },
          }),
        {
          message: /Workflow execution failed: 500/,
        },
      );
    });

    it("should include payload in request body", async () => {
      process.env.WALLET_PRIVATE_KEY =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      let requestBody = "";
      globalThis.fetch = mock.fn(
        async (_url: string, options?: RequestInit) => {
          requestBody = options?.body as string;
          return new Response(JSON.stringify({ result: "ok" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      ) as typeof fetch;

      await paymentsApi.payWorkflow({
        triggerUrl: "https://api.openserv.ai/webhooks/x402/trigger/abc123",
        input: { prompt: "Generate something", count: 5 },
      });

      const parsed = JSON.parse(requestBody);
      assert.deepStrictEqual(parsed.payload, {
        prompt: "Generate something",
        count: 5,
      });
    });

    it("should use empty object for payload when input not provided", async () => {
      process.env.WALLET_PRIVATE_KEY =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      let requestBody = "";
      globalThis.fetch = mock.fn(
        async (_url: string, options?: RequestInit) => {
          requestBody = options?.body as string;
          return new Response(JSON.stringify({ result: "ok" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      ) as typeof fetch;

      await paymentsApi.payWorkflow({
        triggerUrl: "https://api.openserv.ai/webhooks/x402/trigger/abc123",
      });

      const parsed = JSON.parse(requestBody);
      assert.deepStrictEqual(parsed.payload, {});
    });
  });

  describe("payWorkflow with workflowId", () => {
    it("should resolve x402 trigger URL from workflowId", async () => {
      process.env.WALLET_PRIVATE_KEY =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      // Mock triggers.list to return an x402 trigger
      mockClient.triggers.list.mock.mockImplementation(() =>
        Promise.resolve([
          {
            id: "trigger-x402",
            name: "Premium Service",
            token: "x402-token-abc",
            props: { x402Pricing: "0.01" },
            isActive: true,
          },
        ]),
      );

      // Mock fetch for x402 payment
      globalThis.fetch = mock.fn(async () => {
        return new Response(JSON.stringify({ result: "paid" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const result = await paymentsApi.payWorkflow({
        workflowId: 42,
        input: { prompt: "test" },
      });

      assert.strictEqual(result.success, true);

      // Verify triggers.list was called with correct workflowId
      const listCall = mockClient.triggers.list.mock.calls[0].arguments;
      assert.deepStrictEqual(listCall[0], { workflowId: 42 });

      // Verify fetch was called with the resolved x402 URL
      const fetchCall = (globalThis.fetch as ReturnType<typeof mock.fn>).mock
        .calls[0].arguments;
      assert.strictEqual(
        fetchCall[0],
        "https://api.openserv.ai/webhooks/x402/trigger/x402-token-abc",
      );
    });

    it("should resolve x402 trigger by triggerName", async () => {
      process.env.WALLET_PRIVATE_KEY =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      mockClient.triggers.list.mock.mockImplementation(() =>
        Promise.resolve([
          {
            id: "trigger-1",
            name: "Cheap Service",
            token: "token-cheap",
            props: { x402Pricing: "0.001" },
            isActive: true,
          },
          {
            id: "trigger-2",
            name: "Premium Service",
            token: "token-premium",
            props: { x402Pricing: "0.05" },
            isActive: true,
          },
        ]),
      );

      globalThis.fetch = mock.fn(async () => {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await paymentsApi.payWorkflow({
        workflowId: 42,
        triggerName: "Premium Service",
        input: { prompt: "premium request" },
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof mock.fn>).mock
        .calls[0].arguments;
      assert.strictEqual(
        fetchCall[0],
        "https://api.openserv.ai/webhooks/x402/trigger/token-premium",
      );
    });

    it("should throw when no workflowId or triggerUrl provided", async () => {
      process.env.WALLET_PRIVATE_KEY =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      await assert.rejects(
        () => paymentsApi.payWorkflow({ input: { prompt: "test" } }),
        { message: /Either workflowId or triggerUrl is required/ },
      );
    });

    it("should throw when no x402 trigger found for workflow", async () => {
      process.env.WALLET_PRIVATE_KEY =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      mockClient.triggers.list.mock.mockImplementation(() =>
        Promise.resolve([
          {
            id: "trigger-webhook",
            name: "Webhook",
            token: "webhook-token",
            props: { waitForCompletion: true },
            isActive: true,
          },
        ]),
      );

      await assert.rejects(() => paymentsApi.payWorkflow({ workflowId: 99 }), {
        message: /No x402 trigger.*not found.*workflow 99/,
      });
    });

    it("should throw when triggerName x402 not found", async () => {
      process.env.WALLET_PRIVATE_KEY =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      mockClient.triggers.list.mock.mockImplementation(() =>
        Promise.resolve([
          {
            id: "trigger-1",
            name: "Other Service",
            token: "token-1",
            props: { x402Pricing: "0.01" },
            isActive: true,
          },
        ]),
      );

      await assert.rejects(
        () =>
          paymentsApi.payWorkflow({
            workflowId: 42,
            triggerName: "Nonexistent",
          }),
        { message: /x402 trigger "Nonexistent" not found/ },
      );
    });

    it("should prefer triggerUrl over workflowId when both provided", async () => {
      process.env.WALLET_PRIVATE_KEY =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      globalThis.fetch = mock.fn(async () => {
        return new Response(JSON.stringify({ result: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await paymentsApi.payWorkflow({
        workflowId: 42,
        triggerUrl:
          "https://api.openserv.ai/webhooks/x402/trigger/explicit-token",
        input: { prompt: "test" },
      });

      // Should NOT have called triggers.list (triggerUrl takes precedence)
      assert.strictEqual(mockClient.triggers.list.mock.calls.length, 0);

      // Verify fetch was called with the explicit URL
      const fetchCall = (globalThis.fetch as ReturnType<typeof mock.fn>).mock
        .calls[0].arguments;
      assert.strictEqual(
        fetchCall[0],
        "https://api.openserv.ai/webhooks/x402/trigger/explicit-token",
      );
    });
  });

  describe("discoverServices", () => {
    it("should fetch and return x402 services", async () => {
      const services = [
        {
          id: "service-1",
          name: "AI Summary",
          description: "Generates summaries",
          x402Pricing: "$0.01",
          inputSchema: { prompt: { type: "string" } },
          paywallUrl: "https://platform.openserv.ai/paywall/service-1",
          webhookUrl: "https://api.openserv.ai/webhooks/x402/trigger/abc123",
          workspaceName: "My Workspace",
          ownerDisplayName: "John Doe",
          createdAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "service-2",
          name: "Image Generator",
          description: null,
          x402Pricing: "$0.05",
          inputSchema: {},
          paywallUrl: "https://platform.openserv.ai/paywall/service-2",
          webhookUrl: "https://api.openserv.ai/webhooks/x402/trigger/def456",
          workspaceName: "Another Workspace",
          ownerDisplayName: "Jane Smith",
          createdAt: "2024-02-01T00:00:00Z",
        },
      ];

      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ services }),
      );

      const result = await paymentsApi.discoverServices();

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].name, "AI Summary");
      assert.strictEqual(result[0].x402Pricing, "$0.01");
      assert.strictEqual(result[1].name, "Image Generator");
      assert.strictEqual(result[1].description, null);
      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/x402-services",
      ]);
    });

    it("should return empty array when no services", async () => {
      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ services: [] }),
      );

      const result = await paymentsApi.discoverServices();

      assert.deepStrictEqual(result, []);
    });
  });

  describe("getTriggerPreflight", () => {
    it("should fetch trigger preflight info", async () => {
      const preflightData = {
        triggerId: "trigger-123",
        triggerName: "My Trigger",
        triggerDescription: "A paid trigger",
        jsonSchema: { prompt: { type: "string" } },
        uiSchema: {},
        x402Enabled: true,
        x402Pricing: "$0.01",
        x402WalletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        erc8004AgentId: "agent:123",
      };

      globalThis.fetch = mock.fn(async () => {
        return new Response(JSON.stringify(preflightData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const result = await paymentsApi.getTriggerPreflight({
        token: "abc123def456",
      });

      assert.strictEqual(result.triggerId, "trigger-123");
      assert.strictEqual(result.triggerName, "My Trigger");
      assert.strictEqual(result.x402Pricing, "$0.01");
      assert.strictEqual(result.x402Enabled, true);
    });

    it("should throw error on failed preflight fetch", async () => {
      globalThis.fetch = mock.fn(async () => {
        return new Response(JSON.stringify({ error: "Trigger not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await assert.rejects(
        () => paymentsApi.getTriggerPreflight({ token: "invalid-token" }),
        {
          message: /Failed to get trigger preflight: 404/,
        },
      );
    });

    it("should handle null description and erc8004AgentId", async () => {
      const preflightData = {
        triggerId: "trigger-456",
        triggerName: "Simple Trigger",
        triggerDescription: null,
        jsonSchema: {},
        uiSchema: {},
        x402Enabled: true,
        x402Pricing: "$0.001",
        x402WalletAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
        erc8004AgentId: null,
      };

      globalThis.fetch = mock.fn(async () => {
        return new Response(JSON.stringify(preflightData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const result = await paymentsApi.getTriggerPreflight({
        token: "simple-token",
      });

      assert.strictEqual(result.triggerDescription, null);
      assert.strictEqual(result.erc8004AgentId, null);
    });
  });
});
