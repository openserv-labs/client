import type { TriggerConfig } from "./triggers-api";

// ============================================================================
// API Response Types (raw platform responses)
// ============================================================================

export interface Agent {
  id: number;
  name: string;
  capabilities_description: string;
  endpoint_url: string;
  approval_status: string;
  is_listed_on_marketplace: boolean;
  is_trading_agent: boolean;
  scopes: Record<string, unknown> | string[];
  model_parameters?: Record<string, unknown>;
}

export interface Category {
  id: number;
  name: string;
  description?: string | null;
}

export interface MarketplaceAgent {
  id: number;
  name: string;
  capabilities_description: string;
  avatar_url?: string | null;
  author_name: string;
  approval_status: "approved" | "rejected" | "pending" | "in-development";
  scopes: Record<string, unknown>;
  isOwner?: boolean | null;
  categories: Category[];
  kind: "openserv" | "external";
  isBuiltByAgentBuilder: boolean;
  is_trading_agent: boolean;
}

export interface MarketplaceAgentsResponse {
  items: MarketplaceAgent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrivateAgents: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
}

export interface IdResponse {
  id: number;
}

export interface ApiKeyResponse {
  apiKey: string;
}

export interface AuthTokenResponse {
  authToken: string;
  authTokenHash: string;
}

export interface NonceResponse {
  nonce: string;
  message?: string;
}

export interface VerifyResponse {
  success: boolean;
  apiKey: string;
}

// ============================================================================
// Declarative Config Types
// ============================================================================

export interface OutputOption {
  name: string;
  type: "text" | "file" | "json";
  instructions: string;
}

export interface TaskDefinition {
  id?: number;
  name: string;
  agentId: number | string;
  description: string;
  body?: string;
  input?: string;
  dependencies?: string[];
  /**
   * Custom output options for branching workflows.
   * Keys become the output port IDs used in edge sourcePort.
   * @default { default: { name: "Task Output", type: "text", instructions: "Complete the task and provide output" } }
   */
  outputOptions?: Record<string, OutputOption>;
}

export interface EdgeDefinition {
  from: string;
  to: string;
  /**
   * Source port ID - must match a key in the source task's outputOptions.
   * @default "default"
   */
  sourcePort?: string;
  /**
   * Target port ID.
   * @default "input"
   */
  targetPort?: string;
}

export interface WorkflowConfig {
  /** Workflow name. Also used as the agent name in ERC-8004. */
  name: string;
  goal?: string;
  /** Agent IDs to include in the workspace. Optional -- if omitted, derived from tasks[].agentId. If provided, merged with task-derived IDs. */
  agentIds?: (number | string)[];
  triggers?: TriggerConfig[];
  tasks?: TaskDefinition[];
  edges?: EdgeDefinition[];
}

export interface Trigger {
  id: string;
  name: string;
  description?: string;
  integrationConnectionId: string;
  props: Record<string, unknown>;
  url?: string;
  webhookUrl?: string;
  token?: string;
  isActive?: boolean;
  state?: string;
}

export interface Task {
  id: number;
  name?: string;
  description: string;
  assigneeAgentId: number;
  body?: string;
  status: string;
  dependencies: Array<{ dependency_task_id: number } | number>;
}

export interface Edge {
  from: { type: string; id: string | number };
  to: { type: string; id: string | number };
}

export interface WorkflowData {
  id: number;
  /** Workflow name. Also used as the agent name in ERC-8004. */
  name: string;
  goal: string;
  status: string;
  triggers: Trigger[];
  tasks: Task[];
  edges: Edge[];
  agents: Agent[];
}

// ============================================================================
// Web3 / USDC Top-up Types
// ============================================================================

/**
 * Configuration for USDC top-up payments.
 * Returned by the platform to enable wallet-based credit purchases.
 */
export interface UsdcTopupConfig {
  /** Address that receives USDC payments */
  receiverAddress: string;
  /** USDC token contract address on the target chain */
  usdcContractAddress: string;
  /** Chain ID (e.g., 8453 for Base) */
  chainId: number;
  /** Human-readable network name (e.g., "base") */
  network: string;
  /** Conversion rate: USDC to credits (1 USDC = 1 USD = 100_000_000 credits) */
  rateUsdcToCredits: number;
}

/**
 * Request to verify a USDC top-up transaction.
 */
export interface UsdcVerifyRequest {
  /** The transaction hash of the USDC transfer */
  txHash: string;
  /**
   * For non-wallet users: the address that sent the USDC.
   * Required when the user is authenticated via email/Google rather than wallet.
   */
  payerAddress?: string;
  /**
   * For non-wallet users: signature proving ownership of the sending wallet.
   * The signature should be over the message: "Verify USDC top-up: {txHash}"
   */
  signature?: string;
}

/**
 * Response from verifying a USDC top-up transaction.
 */
export interface UsdcVerifyResponse {
  /** Whether the verification was successful */
  success: boolean;
  /** Number of credits added to the user's wallet */
  creditsAdded: number;
  /** Original USDC amount as a string (with decimals) */
  usdcAmount: string;
}

/**
 * Result from the high-level topUp method.
 */
export interface UsdcTopupResult {
  /** Whether the top-up was successful */
  success: boolean;
  /** The transaction hash of the USDC transfer */
  txHash: string;
  /** Number of credits added to the user's wallet */
  creditsAdded: number;
  /** USDC amount transferred (with decimals) */
  usdcAmount: string;
  /** Network where the transaction was sent */
  network: string;
  /** Chain ID of the network */
  chainId: number;
}

// ============================================================================
// ERC-8004 Types
// ============================================================================

/**
 * Request body for deploying a workspace to ERC-8004.
 */
export interface Erc8004DeployRequest {
  /** ERC-8004 agent ID in format "chainId:tokenId" */
  erc8004AgentId: string;
  /** JSON-stringified registration file (agent card) */
  stringifiedAgentCard: string;
  /** Transaction hash of the latest on-chain deployment */
  latestDeploymentTransactionHash?: string;
  /** Timestamp of the latest deployment */
  latestDeploymentTimestamp?: Date;
  /** Wallet address that performed the deployment */
  walletAddress?: string;
  /** Network name (e.g., "base") */
  network?: string;
  /** Chain ID (e.g., 8453 for Base mainnet) */
  chainId?: number;
  /** RPC URL for the chain */
  rpcUrl?: string;
  /**
   * If true, swap USDC in the workspace wallet to ETH for gas before
   * the on-chain deployment transaction.
   *
   * **Not yet implemented.** When set, the deploy method will throw an
   * error explaining the feature is coming soon.
   *
   * Note: even without this flag, if deploy fails for any reason (e.g.
   * insufficient ETH for gas), the error is automatically enriched with
   * the workspace wallet address and funding instructions.
   */
  swap?: boolean;
}

/**
 * Web3 wallet associated with a workspace for ERC-8004 operations.
 */
export interface Web3Wallet {
  /** Wallet record ID */
  id: string;
  /** Whether the agent has been deployed to the blockchain */
  deployed: boolean;
  /** ERC-8004 agent ID in format "chainId:tokenId", null if not yet deployed */
  erc8004AgentId: string | null;
  /** JSON-stringified agent card (registration file), null if not yet deployed */
  stringifiedAgentCard: string | null;
  /** Wallet address on the blockchain */
  address: string | null;
  /** Network name (e.g., "base") */
  network: string | null;
  /** Chain ID (e.g., 8453 for Base mainnet) */
  chainId: number | null;
  /** When the wallet record was created */
  createdAt: string;
  /** When the wallet record was last updated */
  updatedAt: string;
}

/**
 * Request body for importing an existing web3 wallet into a workspace.
 */
export interface ImportWeb3WalletRequest {
  /** Wallet address */
  address: string;
  /** Network name (e.g., "base") */
  network: string;
  /** Chain ID (e.g., 8453 for Base mainnet) */
  chainId: number;
  /** Wallet private key */
  privateKey: string;
}

/**
 * A callable trigger exposed by a workspace, used during ERC-8004 deployment
 * to register the agent's available services on-chain.
 */
export interface CallableTrigger {
  /** Trigger name */
  name: string;
  /** Trigger description */
  description?: string | null;
  /** Input schema for the trigger */
  inputSchema: unknown;
  /** JSON schema for the trigger input */
  jsonSchema?: unknown | null;
  /** Web endpoint URL */
  webEndpoint: string;
  /** HTTP endpoint URL */
  httpEndpoint?: string | null;
}

/**
 * Response from presigning an IPFS upload URL.
 */
export interface PresignIpfsUrlResponse {
  /** Signed Pinata URL for IPFS uploads (expires in 60 seconds) */
  url: string;
}

/**
 * Response from signing feedback auth for a buyer.
 */
export interface SignFeedbackAuthResponse {
  /** The signed feedback auth message */
  signature: string;
}

// ============================================================================
// x402 Payment Types
// ============================================================================

/**
 * Request parameters for paying and executing an x402 workflow.
 *
 * Provide either `workflowId` (recommended) or `triggerUrl`. When `workflowId`
 * is given, the x402 trigger URL is resolved automatically by looking up the
 * workflow's triggers.
 */
export interface X402PaymentRequest {
  /** The workflow ID to pay for. The x402 trigger URL is resolved automatically. */
  workflowId?: number;
  /** The x402 trigger URL (alternative to workflowId - use when you already have the URL) */
  triggerUrl?: string;
  /** Specific trigger name within the workflow (optional, used with workflowId) */
  triggerName?: string;
  /** Wallet private key for payment (or uses WALLET_PRIVATE_KEY env var) */
  privateKey?: string;
  /** Input data to pass to the workflow */
  input?: Record<string, unknown>;
  /** Network to use for payment (default: "base"). Use "base-sepolia" for testnet. */
  network?: string;
}

/**
 * Result from paying and executing an x402 workflow.
 */
export interface X402PaymentResult {
  /** Whether the payment and execution were successful */
  success: boolean;
  /** The payment transaction hash (may be empty - x402 handles internally) */
  txHash: string;
  /** The price paid in USD (may be empty - x402 handles internally) */
  price: string;
  /** The workflow response data */
  response: unknown;
  /** Network where the payment was made */
  network: string;
  /** Chain ID of the network */
  chainId: number;
}
