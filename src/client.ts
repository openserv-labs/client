import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { privateKeyToAccount } from "viem/accounts";
import { normalizePrivateKey } from "./utils";
import { AgentsAPI } from "./agents-api";
import { IntegrationsAPI } from "./integrations-api";
import { ModelsAPI } from "./models-api";
import { TriggersAPI } from "./triggers-api";
import { TasksAPI } from "./tasks-api";
import { WorkflowsAPI } from "./workflows-api";
import { Web3API } from "./web3-api";
import { PaymentsAPI } from "./payments-api";
import { Erc8004API } from "./erc8004-api";
import type { NonceResponse, VerifyResponse } from "./types";

const PLATFORM_URL = process.env.OPENSERV_API_URL || "https://api.openserv.ai";

/**
 * Client for interacting with the OpenServ Platform API.
 *
 * @example
 * ```typescript
 * // Using API key authentication
 * const client = new PlatformClient({ apiKey: 'your-api-key' });
 *
 * // Using environment variable
 * const client = new PlatformClient(); // Uses OPENSERV_USER_API_KEY
 *
 * // Using wallet authentication
 * const client = new PlatformClient();
 * await client.authenticate(process.env.WALLET_PRIVATE_KEY);
 * ```
 */
export class PlatformClient {
  private _apiClient: AxiosInstance;

  /** Wallet address, set by authenticate() or manually. Used as a fallback for x402 trigger wallet resolution. */
  walletAddress?: string;

  /** API for managing agents */
  readonly agents: AgentsAPI;
  /** API for managing integration connections */
  readonly integrations: IntegrationsAPI;
  /** API for discovering available LLM models */
  readonly models: ModelsAPI;
  /** API for managing workflow triggers */
  readonly triggers: TriggersAPI;
  /** API for managing workflow tasks */
  readonly tasks: TasksAPI;
  /** API for managing workflows */
  readonly workflows: WorkflowsAPI;
  /** API for Web3 operations (USDC top-up) */
  readonly web3: Web3API;
  /** API for x402 payments to access paid workflows */
  readonly payments: PaymentsAPI;
  /** API for ERC-8004 agent identity (deployment, wallets, IPFS, reputation) */
  readonly erc8004: Erc8004API;

  /**
   * Get the raw axios client for advanced use cases.
   * @returns The underlying axios instance
   */
  get rawClient(): AxiosInstance {
    return this._apiClient;
  }

  /**
   * Make a GET request to the API.
   * @param path - API endpoint path
   * @param config - Optional Axios request config
   * @returns Response data
   */
  async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this._apiClient.get<T>(path, config);
    return response.data;
  }

  /**
   * Make a POST request to the API.
   * @param path - API endpoint path
   * @param data - Request body data
   * @param config - Optional Axios request config
   * @returns Response data
   */
  async post<T>(
    path: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this._apiClient.post<T>(path, data, config);
    return response.data;
  }

  /**
   * Make a PUT request to the API.
   * @param path - API endpoint path
   * @param data - Request body data
   * @param config - Optional Axios request config
   * @returns Response data
   */
  async put<T>(
    path: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this._apiClient.put<T>(path, data, config);
    return response.data;
  }

  /**
   * Make a DELETE request to the API.
   * @param path - API endpoint path
   * @param config - Optional Axios request config
   * @returns Response data
   */
  async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this._apiClient.delete<T>(path, config);
    return response.data;
  }

  /**
   * Creates a new PlatformClient instance.
   *
   * @param options - Configuration options
   * @param options.apiKey - API key for authentication (defaults to OPENSERV_USER_API_KEY env var)
   * @param options.baseUrl - Base URL for the API (defaults to https://api.openserv.ai)
   */
  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    const apiKey = options?.apiKey || process.env.OPENSERV_USER_API_KEY;
    const baseUrl = options?.baseUrl || PLATFORM_URL;

    this._apiClient = axios.create({
      baseURL: baseUrl,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-openserv-key": apiKey } : {}),
      },
    });

    this.agents = new AgentsAPI(this);
    this.integrations = new IntegrationsAPI(this);
    this.models = new ModelsAPI(this);
    this.triggers = new TriggersAPI(this);
    this.tasks = new TasksAPI(this);
    this.workflows = new WorkflowsAPI(this);
    this.web3 = new Web3API(this);
    this.payments = new PaymentsAPI(this);
    this.erc8004 = new Erc8004API(this);
  }

  /**
   * Authenticate using an Ethereum wallet (SIWE - EIP-4361).
   *
   * This method performs Sign-In with Ethereum authentication:
   * 1. Gets a nonce from the platform
   * 2. Signs the SIWE message with the wallet
   * 3. Verifies the signature and receives an API key
   *
   * @param privateKey - Wallet private key (defaults to WALLET_PRIVATE_KEY env var)
   * @returns The API key received from authentication
   *
   * @example
   * ```typescript
   * const client = new PlatformClient();
   * const apiKey = await client.authenticate(process.env.WALLET_PRIVATE_KEY);
   * // Client is now authenticated and ready to use
   * ```
   */
  async authenticate(privateKey?: string): Promise<string> {
    const walletKey = privateKey || process.env.WALLET_PRIVATE_KEY;

    if (!walletKey) {
      // If no wallet key, assume API key auth is already set up
      return "";
    }

    // Create account and store address for x402 wallet resolution
    const account = privateKeyToAccount(normalizePrivateKey(walletKey));
    const walletAddress = account.address;
    this.walletAddress = walletAddress;

    // Step 1: Get nonce from platform
    const nonceResponse = await this._apiClient.post<NonceResponse>(
      "/auth/wallet/nonce",
      {
        walletAddress,
      },
    );

    const { nonce, message: legacyMessage } = nonceResponse.data;

    if (!nonce && !legacyMessage) {
      throw new Error(
        `Nonce endpoint did not return nonce or message. Response: ${JSON.stringify(nonceResponse.data)}`,
      );
    }

    // Construct SIWE-formatted message (EIP-4361)
    const domain = "platform.openserv.ai";
    const uri = "https://platform.openserv.ai";
    const issuedAt = new Date().toISOString();
    const message =
      legacyMessage ||
      `${domain} wants you to sign in with your Ethereum account:
${walletAddress}

Sign in to OpenServ

URI: ${uri}
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${issuedAt}`;

    // Step 2: Sign the message
    const signature = await account.signMessage({ message });

    // Step 3: Verify signature and get API key
    const verifyResponse = await this._apiClient.post<VerifyResponse>(
      "/auth/wallet/verify",
      {
        walletAddress,
        signature,
        message,
      },
    );

    const apiKey = verifyResponse.data.apiKey;

    // Update client with API key header
    this._apiClient.defaults.headers.common["x-openserv-key"] = apiKey;

    return apiKey;
  }

  /**
   * Resolve wallet address from stored state or environment.
   *
   * Returns `this.walletAddress` (set by `authenticate()`) if available,
   * otherwise derives the address from `WALLET_PRIVATE_KEY` environment variable.
   * Per-trigger overrides are handled at the call site, not here.
   *
   * @returns The resolved wallet address, or undefined if no wallet is available
   */
  resolveWalletAddress(): string | undefined {
    if (this.walletAddress) return this.walletAddress;
    if (process.env.WALLET_PRIVATE_KEY) {
      return privateKeyToAccount(
        normalizePrivateKey(process.env.WALLET_PRIVATE_KEY),
      ).address;
    }
    return undefined;
  }
}
