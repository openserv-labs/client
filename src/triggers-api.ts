import type { PlatformClient } from "./client";
import type { Trigger } from "./types";

// ============================================================================
// Trigger Config Types (user-facing)
// ============================================================================

/**
 * Defines a single property in an input schema.
 */
export interface InputSchemaProperty {
  type: "string" | "number" | "boolean" | "object" | "array";
  title?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

/**
 * Schema defining input fields for a trigger.
 */
export interface InputSchema {
  [key: string]: InputSchemaProperty;
}

/**
 * Configuration for a webhook trigger.
 * Discriminated on `type: "webhook"`.
 */
export interface WebhookTriggerConfig {
  type: "webhook";
  /** Trigger ID (used when syncing existing triggers) */
  id?: string;
  /** Display name for the trigger (shown in listings and UI) */
  name?: string;
  /** Description of what this trigger does */
  description?: string;
  /** Whether to wait for workflow completion before responding */
  waitForCompletion?: boolean;
  /** Timeout in seconds (default: 600) */
  timeout?: number;
  /** JSON Schema for webhook payload validation */
  inputSchema?: Record<string, unknown>;
}

/**
 * Configuration for an x402 (paid) trigger.
 * Discriminated on `type: "x402"`.
 */
export interface X402TriggerConfig {
  type: "x402";
  /** Trigger ID (used when syncing existing triggers) */
  id?: string;
  /** Display name for the service (e.g., "AI Research Assistant") - shown in x402-services listing */
  name?: string;
  /** Description of what this service does - shown in x402-services listing */
  description?: string;
  /** Price in USD (e.g., "0.01") */
  x402Pricing: string;
  /** Wallet address to receive payments */
  x402WalletAddress?: string;
  /** Timeout in seconds (default: 600) */
  timeout?: number;
  /** JSON Schema for request validation */
  inputSchema?: Record<string, unknown>;
  /** x402 triggers always wait for completion */
  waitForCompletion: true;
}

/**
 * Configuration for a cron (scheduled) trigger.
 * Discriminated on `type: "cron"`.
 */
export interface CronTriggerConfig {
  type: "cron";
  /** Trigger ID (used when syncing existing triggers) */
  id?: string;
  /** Display name for the trigger (shown in listings and UI) */
  name?: string;
  /** Description of what this trigger does */
  description?: string;
  /** Cron expression (e.g., "0 9 * * *" for daily at 9 AM) */
  schedule: string;
  /** Timezone as IANA time zone name (default: "UTC") */
  timezone: string;
}

/**
 * Configuration for a manual trigger.
 * Discriminated on `type: "manual"`.
 */
export interface ManualTriggerConfig {
  type: "manual";
  /** Trigger ID (used when syncing existing triggers) */
  id?: string;
  /** Display name for the trigger (shown in listings and UI) */
  name?: string;
  /** Description of what this trigger does */
  description?: string;
}

/**
 * Discriminated union of all trigger configurations.
 * Discriminate on the `type` field to narrow to a specific trigger type.
 */
export type TriggerConfig =
  | WebhookTriggerConfig
  | X402TriggerConfig
  | CronTriggerConfig
  | ManualTriggerConfig;

// ============================================================================
// Trigger Factory Functions
// ============================================================================

/**
 * Factory functions for creating type-safe trigger configurations.
 * Each factory accepts user-friendly parameters and returns a flat,
 * properly typed config with API-ready field names.
 *
 * @example
 * ```typescript
 * import { triggers } from '@openserv-labs/client';
 *
 * const webhook = triggers.webhook({ waitForCompletion: true });
 * // { type: 'webhook', waitForCompletion: true, timeout: 600 }
 *
 * const x402 = triggers.x402({ price: '0.01' });
 * // { type: 'x402', x402Pricing: '0.01', timeout: 600 }
 * ```
 */
export const triggers = {
  /**
   * Create a webhook trigger configuration.
   * @param opts - Options for the webhook trigger
   * @returns Webhook trigger configuration
   */
  webhook: (opts?: {
    name?: string;
    description?: string;
    input?: InputSchema;
    waitForCompletion?: boolean;
    timeout?: number;
  }): WebhookTriggerConfig => ({
    type: "webhook" as const,
    ...(opts?.name && { name: opts.name }),
    ...(opts?.description && { description: opts.description }),
    waitForCompletion: opts?.waitForCompletion ?? false,
    timeout: opts?.timeout ?? 600,
    ...(opts?.input && {
      inputSchema: inputSchemaToJsonSchema(opts.input),
    }),
  }),

  /**
   * Create an x402 (paid) trigger configuration.
   * @param opts - Options for the x402 trigger
   * @param opts.name - Display name for the service (e.g., "AI Research Assistant")
   * @param opts.description - Description of what this service does
   * @param opts.price - Price in USD (e.g., "0.01")
   * @returns x402 trigger configuration
   */
  x402: (opts: {
    name?: string;
    description?: string;
    price: string;
    input?: InputSchema;
    timeout?: number;
    walletAddress?: string;
  }): X402TriggerConfig => ({
    type: "x402" as const,
    ...(opts.name && { name: opts.name }),
    ...(opts.description && { description: opts.description }),
    x402Pricing: opts.price,
    waitForCompletion: true,
    timeout: opts.timeout ?? 600,
    ...(opts.walletAddress && {
      x402WalletAddress: opts.walletAddress,
    }),
    ...(opts.input && {
      inputSchema: inputSchemaToJsonSchema(opts.input),
    }),
  }),

  /**
   * Create a cron (scheduled) trigger configuration.
   * @param opts - Options for the cron trigger
   * @param opts.schedule - Cron expression
   * @param opts.timezone - Timezone (default: "UTC")
   * @returns Cron trigger configuration
   */
  cron: (opts: {
    name?: string;
    description?: string;
    schedule: string;
    timezone?: string;
  }): CronTriggerConfig => ({
    type: "cron" as const,
    ...(opts.name && { name: opts.name }),
    ...(opts.description && { description: opts.description }),
    schedule: opts.schedule,
    timezone: opts.timezone || "UTC",
  }),

  /**
   * Create a manual trigger configuration.
   * @param opts - Optional settings for the manual trigger
   * @returns Manual trigger configuration
   */
  manual: (opts?: {
    name?: string;
    description?: string;
  }): ManualTriggerConfig => ({
    type: "manual" as const,
    ...(opts?.name && { name: opts.name }),
    ...(opts?.description && { description: opts.description }),
  }),
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert an InputSchema to JSON Schema format.
 * @param input - The input schema to convert
 * @returns JSON Schema compliant object
 */
export function inputSchemaToJsonSchema(
  input: InputSchema,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, prop] of Object.entries(input)) {
    properties[key] = {
      type: prop.type,
      ...(prop.title && { title: prop.title }),
      ...(prop.description && { description: prop.description }),
      ...(prop.enum && { enum: prop.enum }),
      ...(prop.default !== undefined && { default: prop.default }),
    };

    if (prop.default === undefined) {
      required.push(key);
    }
  }

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties,
    required,
  };
}

/**
 * API for managing workflow triggers.
 *
 * @example
 * ```typescript
 * const client = new PlatformClient({ apiKey: 'your-key' });
 *
 * // Get integration connection ID
 * const connId = await client.integrations.getOrCreateConnection('webhook-trigger');
 *
 * // Create a trigger
 * const trigger = await client.triggers.create({
 *   workflowId: 123,
 *   name: 'My Webhook',
 *   integrationConnectionId: connId,
 *   props: { waitForCompletion: true }
 * });
 *
 * // Activate the trigger
 * await client.triggers.activate({ workflowId: 123, id: trigger.id });
 * ```
 */
export class TriggersAPI {
  constructor(private client: PlatformClient) {}

  /**
   * Create a new trigger in a workflow.
   * @param params - Parameters object
   * @param params.workflowId - The workflow ID
   * @param params.name - Display name for the trigger (e.g., "AI Research Assistant")
   * @param params.description - Description of what this trigger does
   * @param params.integrationConnectionId - Integration connection ID (e.g., from getOrCreateConnection)
   * @param params.props - Trigger properties
   * @param params.trigger_name - Optional specific trigger name
   * @returns The created trigger
   */
  async create(params: {
    workflowId: number | string;
    name: string;
    description?: string;
    integrationConnectionId: string;
    props?: Record<string, unknown>;
    trigger_name?: string;
  }): Promise<Trigger> {
    const {
      workflowId,
      name,
      description,
      integrationConnectionId,
      props,
      trigger_name,
    } = params;

    const data = await this.client.post<{ id: string; token?: string }>(
      `/workspaces/${workflowId}/trigger`,
      {
        name,
        description: description || name,
        // If trigger_name not specified, server will use the integration's default
        ...(trigger_name && { trigger_name }),
        integrationConnectionId,
        props: props || {},
        attributes: {},
      },
    );

    if (!data.id) {
      throw new Error(
        `Trigger creation returned no ID. Response: ${JSON.stringify(data)}`,
      );
    }

    const triggerId = data.id;
    // The create response may include a token; capture it if present
    const createToken = data.token;

    // The single trigger GET endpoint doesn't include token,
    // so fetch from list (workspace response) which includes it
    const triggersList = await this.list({ workflowId });
    const triggerFromList = triggersList.find((t) => t.id === triggerId);

    if (triggerFromList) {
      return triggerFromList;
    }

    // Fallback to get endpoint if not found in list (shouldn't happen)
    const triggerDetails = await this.get({ workflowId, id: triggerId });
    return {
      ...triggerDetails,
      id: triggerId,
      token: createToken,
    };
  }

  /**
   * Get a trigger by ID.
   * @param params - Parameters object
   * @param params.workflowId - The workflow ID
   * @param params.id - The trigger ID
   * @returns The trigger
   */
  async get(params: {
    workflowId: number | string;
    id: string;
  }): Promise<Trigger> {
    const data = await this.client.get<Trigger>(
      `/workspaces/${params.workflowId}/triggers/${params.id}`,
    );
    // The single trigger GET endpoint doesn't return the ID in the response,
    // so we include it from the request parameters
    return {
      ...data,
      id: params.id,
    };
  }

  /**
   * List all triggers in a workflow.
   * @param params - Parameters object
   * @param params.workflowId - The workflow ID
   * @returns Array of triggers
   */
  async list(params: { workflowId: number | string }): Promise<Trigger[]> {
    // The list endpoint returns available integrations, not actual trigger instances
    // To get actual triggers, we need to fetch from the workspace get endpoint
    const workspace = await this.client.get<{
      triggers?: Array<{
        id: string;
        name: string;
        description?: string | null;
        trigger_name: string;
        integrationConnection: {
          id: string;
          name: string;
          integration: {
            id: string;
            identifier: string;
            name: string;
            description?: string | null;
          };
        };
        props: Record<string, unknown>;
        attributes: {
          uiState?: {
            token?: string;
            tokenCreatedAt?: string;
          };
          [key: string]: unknown;
        };
        is_in_test_mode: boolean;
        is_active: boolean;
        state: string;
      }>;
    }>(`/workspaces/${params.workflowId}`);

    // The workspace response includes triggers with the full structure
    const triggers = workspace.triggers || [];

    // Map to Trigger type - token is in attributes.uiState.token
    return triggers.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description || undefined,
      integrationConnectionId: t.integrationConnection?.id || "",
      props: t.props,
      token: t.attributes?.uiState?.token,
      isActive: t.is_active,
      state: t.state,
    }));
  }

  /**
   * Update an existing trigger.
   * @param params - Parameters object
   * @param params.workflowId - The workflow ID
   * @param params.id - The trigger ID to update
   * @param params.props - New properties (optional)
   * @param params.name - New name (optional)
   * @param params.description - New description (optional)
   * @returns The updated trigger
   */
  async update(params: {
    workflowId: number | string;
    id: string;
    props?: Record<string, unknown>;
    name?: string;
    description?: string;
  }): Promise<Trigger> {
    const { workflowId, id, props, name, description } = params;

    // First get the current trigger to preserve required fields
    const currentTrigger = await this.get({ workflowId, id });

    return this.client.put<Trigger>(
      `/workspaces/${workflowId}/triggers/${id}`,
      {
        name: name ?? currentTrigger.name,
        description:
          description ?? currentTrigger.description ?? currentTrigger.name,
        integrationConnectionId: currentTrigger.integrationConnectionId,
        props: props ?? currentTrigger.props,
      },
    );
  }

  /**
   * Delete a trigger.
   * @param params - Parameters object
   * @param params.workflowId - The workflow ID
   * @param params.id - The trigger ID to delete
   */
  async delete(params: {
    workflowId: number | string;
    id: string;
  }): Promise<void> {
    await this.client.delete(
      `/workspaces/${params.workflowId}/triggers/${params.id}`,
    );
  }

  /**
   * Activate a trigger so it can receive events.
   * @param params - Parameters object
   * @param params.workflowId - The workflow ID
   * @param params.id - The trigger ID to activate
   */
  async activate(params: {
    workflowId: number | string;
    id: string;
  }): Promise<void> {
    const currentTrigger = await this.get({
      workflowId: params.workflowId,
      id: params.id,
    });

    await this.client.put(
      `/workspaces/${params.workflowId}/triggers/${params.id}`,
      {
        name: currentTrigger.name,
        integrationConnectionId: currentTrigger.integrationConnectionId,
        props: currentTrigger.props,
        is_active: true,
      },
    );
  }

  /**
   * Fire a trigger manually (for testing or manual invocation).
   * @param params - Parameters object
   * @param params.workflowId - The workflow ID
   * @param params.id - The trigger ID to fire
   * @param params.input - Optional input data as JSON string
   * @returns Response from the trigger
   */
  async fire(params: {
    workflowId: number | string;
    id: string;
    input?: string;
  }): Promise<unknown> {
    return this.client.put(
      `/workspaces/${params.workflowId}/triggers/${params.id}/trigger`,
      {
        input: params.input || "",
      },
    );
  }
}
