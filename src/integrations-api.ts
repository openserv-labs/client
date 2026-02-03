import type { PlatformClient } from "./client";

export interface IntegrationConnection {
  id: string;
  name: string;
  integrationId: string;
  integrationName: string;
  integrationDisplayName: string;
  integrationDescription?: string | null;
  integrationType: "nango" | "custom";
  integrationLogo?: string | null;
}

export class IntegrationsAPI {
  constructor(private client: PlatformClient) {}

  /**
   * Get list of integration connections for the authenticated user
   */
  async listConnections(): Promise<IntegrationConnection[]> {
    return this.client.get<IntegrationConnection[]>("/integration/connections");
  }

  /**
   * Create an integration connection for a custom integration (like manual-trigger, webhook-trigger, etc.)
   */
  async connect(params: {
    identifier: string;
    props?: Record<string, unknown>;
  }): Promise<{ status: string }> {
    return this.client.post<{ status: string }>("/integration/connection", {
      type: "custom",
      identifier: params.identifier,
      props: params.props || {},
    });
  }

  /**
   * Get the integration connection ID for a specific integration identifier.
   * If no connection exists, creates one for custom integrations.
   */
  async getOrCreateConnection(identifier: string): Promise<string> {
    const connections = await this.listConnections();
    const existing = connections.find((c) => c.integrationName === identifier);
    if (existing) {
      return existing.id;
    }

    // Create a new connection for custom integrations
    await this.connect({ identifier });

    // Fetch again to get the new connection ID
    const updatedConnections = await this.listConnections();
    const newConnection = updatedConnections.find(
      (c) => c.integrationName === identifier,
    );
    if (!newConnection) {
      throw new Error(
        `Failed to create integration connection for ${identifier}`,
      );
    }
    return newConnection.id;
  }
}
