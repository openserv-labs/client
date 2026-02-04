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

export interface TriggerDefinition {
  id?: string;
  name: string;
  type?: "x402" | "webhook" | "cron" | "manual";
  integrationConnectionId?: string;
  props?: Record<string, unknown>;
}

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
  name: string;
  goal?: string;
  agentIds: (number | string)[];
  triggers?: TriggerDefinition[];
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
// x402 Payment Types
// ============================================================================

/**
 * Request parameters for paying and executing an x402 workflow.
 */
export interface X402PaymentRequest {
  /** The x402 trigger URL to pay for (webhookUrl from discoverServices or trigger.webhookUrl) */
  triggerUrl: string;
  /** Wallet private key for payment (or uses WALLET_PRIVATE_KEY env var) */
  privateKey?: string;
  /** Input data to pass to the workflow */
  input?: Record<string, unknown>;
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
