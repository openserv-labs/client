import { ethers } from "ethers";
import * as fs from "node:fs";
import * as path from "node:path";
import { PlatformClient } from "./client";
import { type TriggerConfig, triggerConfigToProps } from "./triggers-api";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for provisioning an agent and workflow.
 *
 * @example
 * ```typescript
 * const config: ProvisionConfig = {
 *   agent: {
 *     name: 'my-agent',
 *     description: 'Handles API requests'
 *   },
 *   workflow: {
 *     name: 'api-workflow',
 *     trigger: triggers.webhook({ waitForCompletion: true }),
 *     task: {
 *       description: 'Process incoming requests',
 *       body: 'Handle the webhook payload'
 *     }
 *   }
 * };
 * ```
 */
export interface ProvisionConfig {
  /** Agent configuration */
  agent: {
    /** Unique name for the agent */
    name: string;
    /** Description of the agent's capabilities */
    description: string;
    /**
     * URL where the agent is hosted.
     * Optional - when using @openserv-labs/sdk v2.0.0+, the endpoint is automatically
     * set to https://agents-proxy.openserv.ai when run(agent) is called.
     * Only provide this if your agent runs with a different publicly accessible URL.
     */
    endpointUrl?: string;
  };
  /** Workflow configuration */
  workflow: {
    /** Name for the workflow */
    name: string;
    /** Trigger configuration (use triggers factory) */
    trigger: TriggerConfig;
    /** Optional task configuration */
    task?: {
      /** Task description */
      description?: string;
      /** Detailed task body */
      body?: string;
    };
  };
}

/**
 * Result from provisioning an agent and workflow.
 */
export interface ProvisionResult {
  /** The created agent's ID */
  agentId: number;
  /** API key for the agent */
  apiKey: string;
  /** Auth token for securing agent requests (if generated) */
  authToken?: string;
  /** The created workflow's ID */
  workflowId: number;
  /** The created trigger's ID */
  triggerId: string;
  /** Token for the trigger (used in URLs) */
  triggerToken: string;
  /** Paywall URL for x402 triggers */
  paywallUrl?: string;
  /** API endpoint URL for webhook triggers */
  apiEndpoint?: string;
}

// State stored in .openserv.json
interface AgentState {
  id: number;
  apiKey: string;
  authToken?: string;
  endpointUrl?: string;
}

interface WorkflowState {
  workspaceId: number;
  triggerId: string;
  triggerToken: string;
}

interface OpenServState {
  userApiKey?: string;
  agents: Record<string, AgentState>;
  workflows: Record<string, Record<string, WorkflowState>>; // agents -> workflows
}

const STATE_FILE = ".openserv.json";

// ============================================================================
// Logger
// ============================================================================

/**
 * Logger interface for provision operations.
 * Implement this to customize logging behavior.
 */
export interface Logger {
  /** Log informational messages */
  info: (...args: unknown[]) => void;
  /** Log warning messages */
  warn: (...args: unknown[]) => void;
  /** Log error messages */
  error: (...args: unknown[]) => void;
}

const defaultLogger: Logger = {
  info: (...args) => console.log("[provision]", ...args),
  warn: (...args) => console.warn("[provision]", ...args),
  error: (...args) => console.error("[provision]", ...args),
};

let logger: Logger = defaultLogger;

/**
 * Set a custom logger for provision operations.
 *
 * @param customLogger - Logger implementation to use
 *
 * @example
 * ```typescript
 * setLogger({
 *   info: (...args) => myLogger.info(...args),
 *   warn: (...args) => myLogger.warn(...args),
 *   error: (...args) => myLogger.error(...args)
 * });
 * ```
 */
export function setLogger(customLogger: Logger): void {
  logger = customLogger;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format axios error for logging
 */
function formatAxiosError(error: unknown): string {
  const axiosError = error as {
    response?: { status: number; data: unknown };
    message?: string;
  };
  return axiosError.response
    ? JSON.stringify({
        status: axiosError.response.status,
        data: axiosError.response.data,
      })
    : axiosError.message || "Unknown error";
}

/**
 * Inject x402 trigger properties (wallet address and waitForCompletion)
 */
function injectX402Props(
  props: Record<string, unknown>,
  walletAddress: string,
  triggerType: string,
): Record<string, unknown> {
  if (triggerType !== "x402") return props;

  return {
    ...props,
    x402WalletAddress: props.x402WalletAddress || walletAddress,
    waitForCompletion: props.waitForCompletion ?? true,
  };
}

// ============================================================================
// State Management (JSON)
// ============================================================================

/**
 * Read the current state from .openserv.json
 */
function readState(): OpenServState {
  const statePath = path.resolve(process.cwd(), STATE_FILE);

  try {
    if (fs.existsSync(statePath)) {
      const content = fs.readFileSync(statePath, "utf-8");
      return JSON.parse(content) as OpenServState;
    }
  } catch (error) {
    logger.warn("Error reading state file:", error);
  }

  // Return empty state
  return {
    agents: {},
    workflows: {},
  };
}

/**
 * Write state to .openserv.json
 */
function writeState(state: OpenServState): void {
  const statePath = path.resolve(process.cwd(), STATE_FILE);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Write an environment variable to .env file
 */
function writeEnvVar(key: string, value: string): void {
  const envPath = path.resolve(process.cwd(), ".env");

  let existingContent = "";
  try {
    if (fs.existsSync(envPath)) {
      existingContent = fs.readFileSync(envPath, "utf-8");
    }
  } catch {
    // File doesn't exist, start fresh
  }

  const lines: string[] = existingContent.split("\n");
  let found = false;

  const updatedLines = lines.map((line) => {
    if (line.trim().startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    updatedLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(envPath, updatedLines.join("\n"));
}

/**
 * Read wallet credentials from .env via process.env
 */
function getWalletFromEnv(): { privateKey?: string; address?: string } {
  return {
    privateKey: process.env.WALLET_PRIVATE_KEY,
    address: process.env.WALLET_ADDRESS,
  };
}

/**
 * Write wallet credentials to .env file
 */
function writeWalletToEnv(privateKey: string, address: string): void {
  writeEnvVar("WALLET_PRIVATE_KEY", privateKey);
  writeEnvVar("WALLET_ADDRESS", address);
}

// ============================================================================
// Wallet Management
// ============================================================================

/**
 * Get or create a wallet for authentication
 */
async function getOrCreateWallet(): Promise<{
  privateKey: string;
  address: string;
}> {
  const { privateKey, address } = getWalletFromEnv();

  if (privateKey && address) {
    return { privateKey, address };
  }

  // Create new wallet
  const wallet = ethers.Wallet.createRandom();
  const newPrivateKey = wallet.privateKey;
  const newAddress = wallet.address;

  // Persist to .env (secrets stay in .env)
  writeWalletToEnv(newPrivateKey, newAddress);

  logger.info("Created new wallet:", newAddress);
  return { privateKey: newPrivateKey, address: newAddress };
}

// ============================================================================
// Platform API Client
// ============================================================================

async function createAuthenticatedClient(privateKey: string): Promise<{
  client: PlatformClient;
  walletAddress: string;
}> {
  const wallet = new ethers.Wallet(privateKey);
  const walletAddress = wallet.address;

  // Check if we have a saved user API key (for session continuity)
  const state = readState();
  const existingApiKey = state.userApiKey;

  if (existingApiKey) {
    // Try to use existing API key
    const client = new PlatformClient({ apiKey: existingApiKey });
    try {
      // Verify it works by listing agents (a simple authenticated call)
      await client.agents.list();
      logger.info("Using existing user API key");
      return { client, walletAddress };
    } catch {
      logger.info("Existing user API key invalid, re-authenticating");
    }
  }

  // Authenticate with wallet using SIWE
  const client = new PlatformClient();
  const apiKey = await client.authenticate(privateKey);

  // Save the user API key to state file for reuse (session continuity)
  writeState({
    ...state,
    userApiKey: apiKey,
  });
  logger.info("User API key saved to state file");

  return { client, walletAddress };
}

// ============================================================================
// Provisioning Functions
// ============================================================================

// Default endpoint URL - SDK v2.0.0+ automatically updates to this when run(agent) is called
const DEFAULT_AGENT_ENDPOINT = "https://agents-proxy.openserv.ai";

/**
 * Check if an error is a "not found" error (404)
 */
function isNotFoundError(error: unknown): boolean {
  const axiosError = error as { response?: { status: number } };
  return axiosError.response?.status === 404;
}

/**
 * Register or update an agent on the platform.
 * This function is idempotent - calling it multiple times with the same config
 * will update the existing agent rather than create duplicates.
 */
async function provisionAgent(
  client: PlatformClient,
  config: ProvisionConfig["agent"],
): Promise<{ agentId: number; apiKey: string; authToken?: string }> {
  const state = readState();
  const existingAgent = state.agents[config.name];

  if (existingAgent) {
    // Update existing agent
    const agentId = existingAgent.id;
    try {
      // Fetch current agent from API to get the latest endpoint_url
      const currentAgent = await client.agents.get({ id: agentId });

      // Use config endpoint if provided, otherwise preserve current endpoint, or use default
      const endpointUrl =
        config.endpointUrl ||
        currentAgent.endpoint_url ||
        DEFAULT_AGENT_ENDPOINT;

      await client.agents.update({
        id: agentId,
        name: config.name,
        capabilities_description: config.description,
        endpoint_url: endpointUrl,
      });
      logger.info(`Updated agent ${agentId}`);

      // Update stored endpoint
      const freshState = readState();
      freshState.agents[config.name] = { ...existingAgent, endpointUrl };
      writeState(freshState);

      return {
        agentId,
        apiKey: existingAgent.apiKey,
        authToken: existingAgent.authToken,
      };
    } catch (error: unknown) {
      // Only create a new agent if the existing one was deleted from the platform (404)
      // For any other error (network issues, auth problems, etc.), propagate the error
      if (isNotFoundError(error)) {
        logger.info(
          `Agent ${agentId} no longer exists on platform, will create new one`,
        );
        // Clear the stale agent from state before creating new one
        delete state.agents[config.name];
        writeState(state);
      } else {
        // Re-throw non-404 errors to avoid creating duplicate agents
        throw new Error(
          `Failed to update agent ${agentId}: ${formatAxiosError(error)}`,
        );
      }
    }
  }

  // Register new agent (only reached if no existing agent, or existing was deleted)
  const endpointUrl = config.endpointUrl || DEFAULT_AGENT_ENDPOINT;
  const agent = await client.agents.create({
    name: config.name,
    capabilities_description: config.description,
    endpoint_url: endpointUrl,
  });

  const agentId = agent.id;

  // Get agent API key
  const apiKey = await client.agents.getApiKey({ id: agentId });

  // Generate and save auth token for securing agent requests
  const { authToken, authTokenHash } = await client.agents.generateAuthToken();
  await client.agents.saveAuthToken({ id: agentId, authTokenHash });
  logger.info("Generated and saved auth token for agent");

  // Re-read state to avoid overwriting concurrent changes
  const freshState = readState();
  freshState.agents[config.name] = {
    id: agentId,
    apiKey,
    authToken,
    endpointUrl,
  };
  writeState(freshState);

  logger.info(`Registered agent ${agentId}: ${config.name}`);
  return { agentId, apiKey, authToken };
}

/**
 * Provision a workflow (workspace + trigger + task)
 */
async function provisionWorkflow(
  client: PlatformClient,
  agentId: number,
  agentName: string,
  walletAddress: string,
  config: ProvisionConfig["workflow"],
): Promise<Omit<ProvisionResult, "agentId" | "apiKey" | "authToken">> {
  const state = readState();
  const workflowName = config.name || "default";

  // Initialize workflows structure if needed
  if (!state.workflows[agentName]) {
    state.workflows[agentName] = {};
  }

  const existingWorkflow = state.workflows[agentName][workflowName];

  let workflowId: number | undefined;
  let triggerId: string | undefined;
  let triggerToken: string | undefined;
  let needsCreate = true;

  if (existingWorkflow) {
    // Update existing workflow
    workflowId = existingWorkflow.workspaceId;
    triggerId = existingWorkflow.triggerId;
    triggerToken = existingWorkflow.triggerToken;
    needsCreate = false;

    try {
      // Get existing trigger to preserve required fields
      const existingTrigger = await client.triggers.get({
        workflowId,
        id: triggerId,
      });

      // Build new props, preserving existing values and injecting x402 props
      const triggerProps = injectX402Props(
        { ...existingTrigger.props, ...triggerConfigToProps(config.trigger) },
        walletAddress,
        config.trigger.type,
      );

      await client.triggers.update({
        workflowId,
        id: triggerId,
        name: existingTrigger.name || config.trigger.type,
        props: triggerProps,
      });
      logger.info(`Updated workflow ${workflowName} (${workflowId})`);
    } catch (error: unknown) {
      // Only create a new workflow if the existing one was deleted from the platform (404)
      // For any other error, propagate it to avoid creating duplicates
      if (isNotFoundError(error)) {
        logger.info(
          `Workflow ${workflowId} no longer exists on platform, will create new one`,
        );
        // Clear stale workflow from state
        delete state.workflows[agentName][workflowName];
        writeState(state);
        needsCreate = true;
      } else {
        throw new Error(
          `Failed to update workflow ${workflowName}: ${formatAxiosError(error)}`,
        );
      }
    }
  }

  if (needsCreate) {
    // Map trigger type to integration identifier
    const triggerTypeToIntegration: Record<string, string> = {
      x402: "x402-trigger",
      webhook: "webhook-trigger",
      cron: "cron-trigger",
      manual: "manual-trigger",
    };

    const integrationIdentifier =
      triggerTypeToIntegration[config.trigger.type] || "manual-trigger";

    // Create trigger props with x402 properties injected
    const triggerProps = injectX402Props(
      triggerConfigToProps(config.trigger) as Record<string, unknown>,
      walletAddress,
      config.trigger.type,
    );

    // Step 1: Create workflow without triggers/tasks (avoids sync API issues)
    const workflow = await client.workflows.create({
      name: `${workflowName} Workflow`,
      goal: config.task?.description || "Process requests",
      agentIds: [agentId],
    });
    workflowId = workflow.id;
    logger.info(`Created workflow ${workflowName} (${workflowId})`);

    // Step 2: Get or create integration connection for the trigger type
    const integrationConnectionId =
      await client.integrations.getOrCreateConnection(integrationIdentifier);

    // Step 3: Create trigger using direct API
    // Use the trigger's name/description if provided, otherwise default to type
    const triggerName = config.trigger.name || config.trigger.type;
    const triggerDescription = config.trigger.description;

    const trigger = await client.triggers.create({
      workflowId,
      name: triggerName,
      description: triggerDescription,
      integrationConnectionId,
      props: triggerProps,
    });
    triggerId = trigger.id;
    triggerToken = trigger.token || "";
    logger.info(
      `Created trigger ${triggerId} (token: ${triggerToken || "N/A"})`,
    );

    // Step 4: Create task using direct API
    const task = await client.tasks.create({
      workflowId,
      agentId,
      description: config.task?.description || "Process the incoming request",
      body: config.task?.body || "",
      input: "",
    });
    const taskId = task.id;
    logger.info(`Created task ${taskId} for workflow ${workflowId}`);

    // Step 5: Create workflow nodes and edges to link trigger to task
    const triggerNodeId = `trigger-${triggerId}`;
    const taskNodeId = `task-${taskId}`;

    const workflowNodes = [
      {
        id: triggerNodeId,
        type: "trigger" as const,
        triggerId,
        position: { x: 0, y: 100 },
        inputPorts: [] as { id: string }[],
        outputPorts: [{ id: "output" }],
        isEndNode: false as const,
      },
      {
        id: taskNodeId,
        type: "task" as const,
        taskId,
        position: { x: 300, y: 100 },
        inputPorts: [{ id: "input" }],
        outputPorts: [{ id: "output" }],
        isEndNode: true,
      },
    ];

    const workflowEdges = [
      {
        id: `edge-${triggerId}-${taskId}`,
        source: triggerNodeId,
        target: taskNodeId,
        sourcePort: "output",
        targetPort: "input",
      },
    ];

    await client.put(`/workspaces/${workflowId}/workflow`, {
      workflow: {
        nodes: workflowNodes,
        edges: workflowEdges,
        lastUpdatedTimestamp: Date.now(),
      },
    });
    logger.info(
      `Created workflow edges linking trigger ${triggerId} to task ${taskId}`,
    );

    // Step 6: Activate trigger
    await client.triggers.activate({ workflowId, id: triggerId });

    // Step 7: Set workspace to running
    await client.workflows.setRunning({ id: workflowId });

    // Re-read state to avoid overwriting concurrent changes
    const freshState = readState();
    if (!freshState.workflows[agentName]) {
      freshState.workflows[agentName] = {};
    }
    freshState.workflows[agentName][workflowName] = {
      workspaceId: workflowId,
      triggerId,
      triggerToken,
    };
    writeState(freshState);

    logger.info(`Provisioned workflow ${workflowName} (${workflowId})`);
  }

  // Validate that all required values are set
  // Note: triggerToken may be empty for manual/cron triggers (only x402/webhook have tokens)
  if (!workflowId || !triggerId) {
    throw new Error("Failed to provision workflow: missing required IDs");
  }

  // Ensure triggerToken is at least an empty string
  if (triggerToken === undefined) {
    triggerToken = "";
  }

  // Build URLs
  const paywallUrl =
    config.trigger.type === "x402"
      ? `https://platform.openserv.ai/workspace/paywall/${triggerToken}`
      : undefined;

  const apiEndpoint =
    config.trigger.type === "webhook"
      ? `https://api.openserv.ai/workspaces/${workflowId}/triggers/${triggerId}/fire`
      : undefined;

  return {
    workflowId,
    triggerId,
    triggerToken,
    paywallUrl,
    apiEndpoint,
  };
}

// ============================================================================
// Main Provision Function
// ============================================================================

/**
 * Provision an agent and workflow on the OpenServ platform.
 *
 * **This function is idempotent** - you can call it multiple times with the same
 * config and it will update existing resources rather than create duplicates.
 * There's no need to check `isProvisioned()` before calling this function.
 *
 * This function handles:
 * - Wallet creation/retrieval
 * - Platform authentication (with session persistence)
 * - Agent registration/update (creates if new, updates if exists)
 * - Workflow creation/update (creates if new, updates if exists)
 * - State persistence to .openserv.json
 *
 * @param config - Provisioning configuration
 * @returns Provision result with IDs and URLs
 *
 * @example
 * ```ts
 * import { provision, triggers } from '@openserv-labs/client';
 *
 * // Just call provision - it handles create vs update automatically
 * const result = await provision({
 *   agent: {
 *     name: 'my-agent',
 *     description: 'My autonomous agent',
 *   },
 *   workflow: {
 *     name: 'default',
 *     trigger: triggers.webhook(),
 *     task: {
 *       description: 'Process incoming requests',
 *     },
 *   },
 * });
 *
 * console.log('Agent ID:', result.agentId);
 * console.log('API Endpoint:', result.apiEndpoint);
 * ```
 */
export async function provision(
  config: ProvisionConfig,
): Promise<ProvisionResult> {
  // Get or create wallet
  const { privateKey } = await getOrCreateWallet();

  // Create authenticated client (reuses saved API key for session continuity)
  const { client, walletAddress } = await createAuthenticatedClient(privateKey);

  // Provision agent (returns agentId, apiKey, and authToken)
  const { agentId, apiKey, authToken } = await provisionAgent(
    client,
    config.agent,
  );

  // Set credentials in process.env so Agent can read them
  process.env.OPENSERV_API_KEY = apiKey;
  if (authToken) {
    process.env.OPENSERV_AUTH_TOKEN = authToken;
  }

  // Provision workflow (pass agent name and wallet address for x402 triggers)
  const workflowResult = await provisionWorkflow(
    client,
    agentId,
    config.agent.name,
    walletAddress,
    config.workflow,
  );

  return {
    agentId,
    apiKey,
    authToken,
    ...workflowResult,
  };
}

/**
 * Check if an agent and workflow are already provisioned.
 *
 * This checks the local `.openserv.json` state file.
 *
 * **Note:** Since `provision()` is idempotent, you typically don't need to call
 * this before provisioning. This function is useful for:
 * - Skipping setup logs/messages on subsequent runs
 * - Checking status without making API calls
 * - Conditional logic based on provisioning state
 *
 * @param agentName - Name of the agent to check
 * @param workflowName - Name of the workflow (defaults to "default")
 * @returns True if both agent and workflow are provisioned
 *
 * @example
 * ```typescript
 * // Optional: use for conditional logging
 * if (!isProvisioned('my-agent', 'api-workflow')) {
 *   console.log('First-time setup...');
 * }
 *
 * // provision() is idempotent - safe to call regardless
 * await provision(config);
 * ```
 */
export function isProvisioned(
  agentName: string,
  workflowName?: string,
): boolean {
  const state = readState();
  const workflow = workflowName || "default";
  const agent = state.agents[agentName];
  const workflowState = state.workflows[agentName]?.[workflow];
  return !!agent && !!workflowState;
}

/**
 * Get provisioned workflow info from the local state file.
 *
 * @param agentName - Name of the agent
 * @param workflowName - Name of the workflow (defaults to "default")
 * @returns Object with agent and workflow details, or null if not provisioned
 *
 * @example
 * ```typescript
 * const info = getProvisionedInfo('my-agent', 'api-workflow');
 * if (info) {
 *   console.log('Agent ID:', info.agentId);
 *   console.log('Workflow ID:', info.workflowId);
 * }
 * ```
 */
export function getProvisionedInfo(
  agentName: string,
  workflowName?: string,
): {
  agentId?: number;
  apiKey?: string;
  authToken?: string;
  workflowId?: number;
  triggerId?: string;
  triggerToken?: string;
} | null {
  const state = readState();
  const workflow = workflowName || "default";

  const agent = state.agents[agentName];
  const workflowState = state.workflows[agentName]?.[workflow];

  if (!agent || !workflowState) {
    return null;
  }

  return {
    agentId: agent.id,
    apiKey: agent.apiKey,
    authToken: agent.authToken,
    workflowId: workflowState.workspaceId,
    triggerId: workflowState.triggerId,
    triggerToken: workflowState.triggerToken,
  };
}

/**
 * Clear all provisioned state.
 *
 * This deletes the `.openserv.json` file. Useful for testing or resetting.
 * Note: This does not delete resources from the platform, only the local state file.
 *
 * @example
 * ```typescript
 * clearProvisionedState();
 * // Now provision will create new resources
 * await provision(config);
 * ```
 */
export function clearProvisionedState(): void {
  const statePath = path.resolve(process.cwd(), STATE_FILE);
  try {
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
      logger.info("Cleared provision state file");
    }
  } catch (error) {
    logger.warn("Error clearing state file:", error);
  }
}
