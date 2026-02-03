import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { AgentsAPI } from "../../src/agents-api";

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

describe("AgentsAPI", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let agentsApi: AgentsAPI;

  beforeEach(() => {
    mockClient = createMockClient();
    agentsApi = new AgentsAPI(mockClient as any);
  });

  describe("list", () => {
    it("should list agents from paginated response", async () => {
      const agents = [
        { id: 1, name: "Agent 1" },
        { id: 2, name: "Agent 2" },
      ];

      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ items: agents }),
      );

      const result = await agentsApi.list();

      assert.deepStrictEqual(result, agents);
      assert.strictEqual(mockClient.get.mock.callCount(), 1);
      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/agents",
      ]);
    });

    it("should handle non-paginated response", async () => {
      const agents = [{ id: 1, name: "Agent 1" }];

      mockClient.get.mock.mockImplementation(() => Promise.resolve(agents));

      const result = await agentsApi.list();

      assert.deepStrictEqual(result, agents);
    });
  });

  describe("get", () => {
    it("should get an agent by ID", async () => {
      const agent = { id: 123, name: "Test Agent" };

      mockClient.get.mock.mockImplementation(() => Promise.resolve(agent));

      const result = await agentsApi.get({ id: 123 });

      assert.deepStrictEqual(result, agent);
      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/agents/123",
      ]);
    });

    it("should accept string ID", async () => {
      const agent = { id: 123, name: "Test Agent" };

      mockClient.get.mock.mockImplementation(() => Promise.resolve(agent));

      await agentsApi.get({ id: "123" });

      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/agents/123",
      ]);
    });
  });

  describe("searchOwned", () => {
    it("should search owned agents by query", async () => {
      const agents = [{ id: 1, name: "my-agent" }];

      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve({ items: agents }),
      );

      const result = await agentsApi.searchOwned({ query: "my-agent" });

      assert.deepStrictEqual(result, agents);
      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/agents",
        { params: { search: "my-agent" } },
      ]);
    });
  });

  describe("listMarketplace", () => {
    it("should list marketplace agents with default params", async () => {
      const response = {
        items: [
          {
            id: 1,
            name: "Public Agent",
            capabilities_description: "Does things",
            avatar_url: "https://example.com/avatar.png",
            author_name: "John Doe",
            approval_status: "approved",
            scopes: {},
            isOwner: false,
            categories: [{ id: 1, name: "Productivity", description: null }],
            kind: "external",
            isBuiltByAgentBuilder: false,
            is_trading_agent: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        hasPrivateAgents: false,
      };

      mockClient.get.mock.mockImplementation(() => Promise.resolve(response));

      const result = await agentsApi.listMarketplace();

      assert.deepStrictEqual(result, response);
      assert.strictEqual(mockClient.get.mock.callCount(), 1);
      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/marketplace/agents-classic",
        {
          params: {
            search: "",
            page: 1,
            pageSize: 50,
            showPrivateAgents: "true",
          },
        },
      ]);
    });

    it("should list marketplace agents with custom params", async () => {
      const response = {
        items: [],
        total: 0,
        page: 2,
        pageSize: 20,
        totalPages: 0,
        hasPrivateAgents: true,
      };

      mockClient.get.mock.mockImplementation(() => Promise.resolve(response));

      const result = await agentsApi.listMarketplace({
        search: "data processing",
        page: 2,
        pageSize: 20,
        showPrivateAgents: false,
      });

      assert.deepStrictEqual(result, response);
      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/marketplace/agents-classic",
        {
          params: {
            search: "data processing",
            page: 2,
            pageSize: 20,
            showPrivateAgents: "false",
          },
        },
      ]);
    });

    it("should default showPrivateAgents to true when not specified", async () => {
      const response = {
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        hasPrivateAgents: false,
      };

      mockClient.get.mock.mockImplementation(() => Promise.resolve(response));

      await agentsApi.listMarketplace({ pageSize: 10 });

      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/marketplace/agents-classic",
        {
          params: {
            search: "",
            page: 1,
            pageSize: 10,
            showPrivateAgents: "true",
          },
        },
      ]);
    });

    it("should return multiple marketplace agents with categories", async () => {
      const response = {
        items: [
          {
            id: 1,
            name: "Agent One",
            capabilities_description: "First agent",
            avatar_url: null,
            author_name: "Author 1",
            approval_status: "approved",
            scopes: { read: true },
            isOwner: true,
            categories: [
              { id: 1, name: "AI", description: "AI agents" },
              { id: 2, name: "Data", description: "Data processing" },
            ],
            kind: "openserv",
            isBuiltByAgentBuilder: true,
            is_trading_agent: false,
          },
          {
            id: 2,
            name: "Agent Two",
            capabilities_description: "Second agent",
            avatar_url: "https://example.com/avatar2.png",
            author_name: "Author 2",
            approval_status: "pending",
            scopes: {},
            isOwner: false,
            categories: [],
            kind: "external",
            isBuiltByAgentBuilder: false,
            is_trading_agent: true,
          },
        ],
        total: 2,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        hasPrivateAgents: true,
      };

      mockClient.get.mock.mockImplementation(() => Promise.resolve(response));

      const result = await agentsApi.listMarketplace();

      assert.strictEqual(result.items.length, 2);
      assert.strictEqual(result.total, 2);
      assert.strictEqual(result.hasPrivateAgents, true);
      assert.strictEqual(result.items[0].categories.length, 2);
      assert.strictEqual(result.items[1].categories.length, 0);
    });
  });

  describe("create", () => {
    it("should create an agent", async () => {
      const createdAgent = {
        id: 123,
        name: "New Agent",
        capabilities_description: "Test capabilities",
        endpoint_url: "https://example.com",
      };

      mockClient.post.mock.mockImplementation(() =>
        Promise.resolve({ id: 123 }),
      );
      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve(createdAgent),
      );

      const result = await agentsApi.create({
        name: "New Agent",
        capabilities_description: "Test capabilities",
        endpoint_url: "https://example.com",
      });

      assert.deepStrictEqual(result, createdAgent);

      // Verify POST call
      const postCall = mockClient.post.mock.calls[0].arguments;
      assert.strictEqual(postCall[0], "/agents");
      assert.deepStrictEqual(postCall[1], {
        name: "New Agent",
        capabilities_description: "Test capabilities",
        endpoint_url: "https://example.com",
        kind: "external",
        is_built_by_agent_builder: false,
      });
    });
  });

  describe("getApiKey", () => {
    it("should get agent API key", async () => {
      mockClient.post.mock.mockImplementation(() =>
        Promise.resolve({ apiKey: "secret-key-123" }),
      );

      const result = await agentsApi.getApiKey({ id: 123 });

      assert.strictEqual(result, "secret-key-123");
      assert.deepStrictEqual(mockClient.post.mock.calls[0].arguments, [
        "/agents/123/api-key",
        {},
      ]);
    });
  });

  describe("update", () => {
    it("should update an agent preserving existing fields", async () => {
      const existingAgent = {
        id: 123,
        name: "Original Name",
        capabilities_description: "Original desc",
        endpoint_url: "https://original.com",
        approval_status: "in-development",
        is_listed_on_marketplace: false,
        is_trading_agent: false,
        scopes: {},
      };

      const updatedAgent = {
        ...existingAgent,
        name: "Updated Name",
      };

      // First call is get (to preserve fields), second is also get (after update)
      let callCount = 0;
      mockClient.get.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(existingAgent);
        }
        return Promise.resolve(updatedAgent);
      });

      mockClient.put.mock.mockImplementation(() =>
        Promise.resolve({ success: true }),
      );

      const result = await agentsApi.update({
        id: 123,
        name: "Updated Name",
      });

      assert.strictEqual(result.name, "Updated Name");

      // Verify PUT was called with preserved fields
      const putCall = mockClient.put.mock.calls[0].arguments;
      assert.strictEqual(putCall[0], "/agents/123");
      assert.strictEqual(putCall[1].name, "Updated Name");
      assert.strictEqual(putCall[1].capabilities_description, "Original desc");
      assert.strictEqual(putCall[1].endpoint_url, "https://original.com");
    });

    it("should throw error when updating external agent without endpoint_url", async () => {
      const existingAgent = {
        id: 123,
        name: "Original Name",
        capabilities_description: "Original desc",
        // No endpoint_url
        approval_status: "in-development",
        is_listed_on_marketplace: false,
        is_trading_agent: false,
        scopes: {},
      };

      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve(existingAgent),
      );

      await assert.rejects(
        () => agentsApi.update({ id: 123, name: "New Name" }),
        {
          message: "endpoint_url is required when updating an external agent",
        },
      );
    });
  });

  describe("delete", () => {
    it("should delete an agent", async () => {
      mockClient.delete.mock.mockImplementation(() =>
        Promise.resolve({ success: true }),
      );

      await agentsApi.delete({ id: 123 });

      assert.deepStrictEqual(mockClient.delete.mock.calls[0].arguments, [
        "/agents/123/developer",
      ]);
    });
  });

  describe("generateAuthToken", () => {
    it("should generate auth token", async () => {
      mockClient.post.mock.mockImplementation(() =>
        Promise.resolve({
          authToken: "plain-token",
          authTokenHash: "hashed-token",
        }),
      );

      const result = await agentsApi.generateAuthToken();

      assert.deepStrictEqual(result, {
        authToken: "plain-token",
        authTokenHash: "hashed-token",
      });
      assert.deepStrictEqual(mockClient.post.mock.calls[0].arguments, [
        "/agents/generate-auth-token",
        {},
      ]);
    });
  });

  describe("saveAuthToken", () => {
    it("should save auth token hash", async () => {
      mockClient.post.mock.mockImplementation(() =>
        Promise.resolve({ success: true }),
      );

      await agentsApi.saveAuthToken({
        id: 123,
        authTokenHash: "hashed-token",
      });

      assert.deepStrictEqual(mockClient.post.mock.calls[0].arguments, [
        "/agents/123/auth-token",
        { authTokenHash: "hashed-token" },
      ]);
    });
  });
});
