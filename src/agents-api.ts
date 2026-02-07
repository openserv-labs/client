import type { PlatformClient } from "./client";
import type {
  Agent,
  PaginatedResponse,
  IdResponse,
  ApiKeyResponse,
  AuthTokenResponse,
  MarketplaceAgentsResponse,
} from "./types";

/**
 * API for managing agents on the OpenServ platform.
 *
 * @example
 * ```typescript
 * const client = new PlatformClient({ apiKey: 'your-key' });
 *
 * // List your own agents
 * const myAgents = await client.agents.list();
 *
 * // Search your own agents by name/description
 * const myMatches = await client.agents.searchOwned({ query: 'data' });
 *
 * // List all public marketplace agents
 * const marketplaceAgents = await client.agents.listMarketplace();
 *
 * // Search all marketplace agents (semantic search)
 * const searchResults = await client.agents.listMarketplace({
 *   search: 'data processing',
 *   page: 1,
 *   pageSize: 20
 * });
 *
 * // Create an agent
 * const agent = await client.agents.create({
 *   name: 'My Agent',
 *   capabilities_description: 'Handles data processing',
 *   endpoint_url: 'https://my-agent.example.com'
 * });
 * ```
 */
export class AgentsAPI {
  constructor(private client: PlatformClient) {}

  /**
   * List all agents owned by the authenticated user.
   * @returns Array of agents
   */
  async list(): Promise<Agent[]> {
    const data = await this.client.get<PaginatedResponse<Agent>>("/agents");
    return data.items || (data as unknown as Agent[]);
  }

  /**
   * List all public agents from the marketplace.
   * @param params - Optional parameters
   * @param params.search - Search query to filter agents
   * @param params.page - Page number (default: 1)
   * @param params.pageSize - Number of items per page (default: 50)
   * @param params.showPrivateAgents - Include private agents owned by the user (default: true)
   * @returns Paginated marketplace agents response
   */
  async listMarketplace(params?: {
    search?: string;
    page?: number;
    pageSize?: number;
    showPrivateAgents?: boolean;
  }): Promise<MarketplaceAgentsResponse> {
    return this.client.get<MarketplaceAgentsResponse>(
      "/marketplace/agents-classic",
      {
        params: {
          search: params?.search || "",
          page: params?.page || 1,
          pageSize: params?.pageSize || 50,
          showPrivateAgents:
            params?.showPrivateAgents !== false ? "true" : "false",
        },
      },
    );
  }

  /**
   * Get an agent by ID.
   * @param params - Parameters object
   * @param params.id - The agent ID
   * @returns The agent
   */
  async get(params: { id: number | string }): Promise<Agent> {
    return this.client.get<Agent>(`/agents/${params.id}`);
  }

  /**
   * Search for agents owned by the authenticated user.
   * Searches both name and capabilities_description fields.
   * For marketplace-wide search, use listMarketplace({ search }) instead.
   * @param params - Parameters object
   * @param params.query - Search query to match against agent names and descriptions
   * @returns Array of matching agents owned by the user
   */
  async searchOwned(params: { query: string }): Promise<Agent[]> {
    const data = await this.client.get<PaginatedResponse<Agent>>("/agents", {
      params: { search: params.query },
    });
    return data.items || (data as unknown as Agent[]);
  }

  /**
   * Create a new agent.
   * @param params - Parameters object
   * @param params.name - Unique name for the agent
   * @param params.capabilities_description - Description of what the agent can do
   * @param params.endpoint_url - URL where the agent is hosted
   * @param params.model_parameters - Optional model parameters (e.g. { model: "gpt-5-mini", verbosity: "medium", reasoning_effort: "low" })
   * @returns The created agent
   */
  async create(params: {
    name: string;
    capabilities_description: string;
    endpoint_url: string;
    model_parameters?: Record<string, unknown>;
  }): Promise<Agent> {
    const data = await this.client.post<IdResponse>("/agents", {
      name: params.name,
      capabilities_description: params.capabilities_description,
      endpoint_url: params.endpoint_url,
      kind: "external",
      is_built_by_agent_builder: false,
      ...(params.model_parameters && {
        model_parameters: params.model_parameters,
      }),
    });
    return this.get({ id: data.id });
  }

  /**
   * Get the API key for an agent.
   * @param params - Parameters object
   * @param params.id - The agent ID
   * @returns The agent's API key
   */
  async getApiKey(params: { id: number | string }): Promise<string> {
    const data = await this.client.post<ApiKeyResponse>(
      `/agents/${params.id}/api-key`,
      {},
    );
    return data.apiKey;
  }

  /**
   * Update an existing agent.
   * @param params - Parameters object
   * @param params.id - The agent ID to update
   * @param params.endpoint_url - New endpoint URL (optional)
   * @param params.name - New name (optional)
   * @param params.capabilities_description - New description (optional)
   * @returns The updated agent
   */
  async update(params: {
    id: number | string;
    endpoint_url?: string;
    name?: string;
    capabilities_description?: string;
  }): Promise<Agent> {
    const { id, endpoint_url, name, capabilities_description } = params;

    // First get the current agent to preserve ALL required fields
    const currentAgent = await this.get({ id });

    // Build update payload - API uses PUT and requires ALL fields
    // Note: scopes must be an object, not an array (API may return [] for empty scopes)
    const scopes =
      currentAgent.scopes && !Array.isArray(currentAgent.scopes)
        ? currentAgent.scopes
        : {};

    const updatePayload = {
      name: name ?? currentAgent.name,
      capabilities_description:
        capabilities_description ?? currentAgent.capabilities_description,
      endpoint_url: endpoint_url ?? currentAgent.endpoint_url,
      kind: "external" as const,
      is_built_by_agent_builder: false as const,
      // Required fields that must be preserved
      approval_status: currentAgent.approval_status || "in-development",
      is_listed_on_marketplace: currentAgent.is_listed_on_marketplace ?? false,
      is_trading_agent: currentAgent.is_trading_agent ?? false,
      scopes,
    };

    // endpoint_url is required for external agents.
    // For your own agents, the GET endpoint returns endpoint_url.
    // For other agents (not owned by you), endpoint_url is not returned.
    if (updatePayload.kind === "external" && !updatePayload.endpoint_url) {
      throw new Error(
        "endpoint_url is required when updating an external agent",
      );
    }

    await this.client.put(`/agents/${id}`, updatePayload);
    return this.get({ id });
  }

  /**
   * Delete an agent.
   * @param params - Parameters object
   * @param params.id - The agent ID to delete
   */
  async delete(params: { id: number | string }): Promise<void> {
    // Use developer endpoint - admin-only endpoint requires elevated permissions
    await this.client.delete(`/agents/${params.id}/developer`);
  }

  /**
   * Generate a new auth token for securing agent requests.
   * Returns both the plaintext token (for the agent) and the hash (for the platform).
   */
  async generateAuthToken(): Promise<{
    authToken: string;
    authTokenHash: string;
  }> {
    return this.client.post<AuthTokenResponse>(
      "/agents/generate-auth-token",
      {},
    );
  }

  /**
   * Save the auth token hash to the platform for a specific agent.
   * The platform will use this to verify requests to the agent.
   */
  async saveAuthToken(params: {
    id: number | string;
    authTokenHash: string;
  }): Promise<void> {
    await this.client.post(`/agents/${params.id}/auth-token`, {
      authTokenHash: params.authTokenHash,
    });
  }
}
