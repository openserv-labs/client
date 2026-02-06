import {
  createPublicClient,
  createWalletClient,
  http,
  decodeEventLog,
  defineChain,
  type Address,
  type Hex,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PinataSDK } from "pinata";
import type { PlatformClient } from "./client";
import type {
  Erc8004DeployRequest,
  Web3Wallet,
  ImportWeb3WalletRequest,
  CallableTrigger,
  PresignIpfsUrlResponse,
  SignFeedbackAuthResponse,
  WorkflowData,
} from "./types";
import { IDENTITY_REGISTRY_ABI } from "./erc8004-abi.js";
import { getErc8004Chain, getErc8004Contracts } from "./erc8004-contracts.js";

/**
 * API for ERC-8004 agent identity operations on the OpenServ platform.
 *
 * ERC-8004 is an on-chain agent identity standard. This API enables:
 * - Deploying workspace agents to the blockchain as ERC-8004 tokens
 * - Managing web3 wallets associated with workspaces
 * - Presigning IPFS URLs for uploading agent registration files
 * - Querying callable triggers for on-chain service registration
 * - Signing feedback auth for reputation interactions
 *
 * @example
 * ```typescript
 * const client = new PlatformClient({ apiKey: 'your-key' });
 *
 * // Generate a web3 wallet for the workspace
 * const wallet = await client.erc8004.generateWallet({ workflowId: 123 });
 *
 * // Get a presigned IPFS URL for uploading the agent card
 * const { url } = await client.erc8004.presignIpfsUrl({ workflowId: 123 });
 *
 * // Deploy to ERC-8004
 * await client.erc8004.deploy({
 *   workflowId: 123,
 *   erc8004AgentId: '8453:42',
 *   stringifiedAgentCard: JSON.stringify(registrationFile),
 *   walletAddress: '0x...',
 *   network: 'base',
 *   chainId: 8453,
 * });
 * ```
 */
export class Erc8004API {
  constructor(private client: PlatformClient) {}

  // ===========================================================================
  // ERC-8004 Deployment
  // ===========================================================================

  /**
   * Deploy a workspace agent to the ERC-8004 identity registry.
   *
   * This records the deployment details in the platform database. The actual
   * on-chain registration should be performed separately using the agent0 SDK.
   * Call this method both before and after blockchain registration to keep
   * the platform in sync.
   *
   * If the deploy fails (e.g. insufficient ETH for gas), the error is
   * enriched with the workspace wallet address and instructions for funding
   * it so you can retry.
   *
   * @param params - Deployment parameters
   * @param params.workflowId - The workflow (workspace) ID to deploy
   * @param params.erc8004AgentId - Agent ID in format "chainId:tokenId"
   * @param params.stringifiedAgentCard - JSON-stringified registration file
   * @param params.latestDeploymentTransactionHash - Transaction hash from on-chain registration
   * @param params.latestDeploymentTimestamp - Timestamp of the deployment
   * @param params.walletAddress - Wallet address that performed the deployment
   * @param params.network - Network name (e.g., "base")
   * @param params.chainId - Chain ID (e.g., 8453 for Base mainnet)
   * @param params.rpcUrl - RPC URL for the chain
   * @param params.swap - If true, swap USDC in the wallet to ETH for gas before deploying (not yet implemented)
   * @returns The updated workflow data
   *
   * @example
   * ```typescript
   * // Before blockchain registration (save initial state)
   * await client.erc8004.deploy({
   *   workflowId: 123,
   *   erc8004AgentId: '',
   *   stringifiedAgentCard: JSON.stringify(registrationFile),
   *   walletAddress: '0x...',
   *   network: 'base',
   *   chainId: 8453,
   *   rpcUrl: 'https://mainnet.base.org',
   * });
   *
   * // ... perform on-chain registration ...
   *
   * // After blockchain registration (save final state with tx hash)
   * await client.erc8004.deploy({
   *   workflowId: 123,
   *   erc8004AgentId: '8453:42',
   *   stringifiedAgentCard: JSON.stringify(updatedRegistrationFile),
   *   latestDeploymentTransactionHash: '0xabc...',
   *   latestDeploymentTimestamp: new Date(),
   *   walletAddress: '0x...',
   *   network: 'base',
   *   chainId: 8453,
   *   rpcUrl: 'https://mainnet.base.org',
   * });
   * ```
   */
  async deploy(
    params: Erc8004DeployRequest & { workflowId: number },
  ): Promise<WorkflowData> {
    const { workflowId, swap, ...body } = params;

    if (swap) {
      throw new Error(
        "USDC-to-ETH swap for gas is not yet implemented. " +
          "This feature is coming soon. In the meantime, fund the workspace " +
          "wallet with ETH directly and retry without the swap option.",
      );
    }

    try {
      return await this.client.put<WorkflowData>(
        `/workspaces/${workflowId}/erc-8004/deploy`,
        body,
      );
    } catch (error: unknown) {
      // Enrich the error with wallet info so the user knows where to send ETH
      throw await this.enrichDeployError(error, workflowId);
    }
  }

  /**
   * Enrich a deploy error with the workspace wallet address and funding
   * instructions. Called automatically when deploy() fails.
   */
  private async enrichDeployError(
    originalError: unknown,
    workflowId: number,
  ): Promise<Error> {
    const originalMessage =
      originalError instanceof Error
        ? originalError.message
        : String(originalError);

    let walletAddress: string | null = null;
    try {
      const wallet = await this.getWallet({ workflowId });
      walletAddress = wallet.address;
    } catch {
      // Wallet may not exist yet
    }

    const fundingHint = walletAddress
      ? `\n\nWorkspace wallet address: ${walletAddress}\n` +
        `Send ETH to this address to cover gas fees, then retry.` +
        `\n\nNote: automatic USDC-to-ETH swap is coming soon. ` +
        `Once available, pass swap: true to convert USDC in the wallet to ETH for gas.`
      : `\n\nNo wallet found for this workspace. ` +
        `Generate one first with client.erc8004.generateWallet({ workflowId: ${workflowId} }), ` +
        `then fund it with ETH and retry.`;

    return new Error(originalMessage + fundingHint);
  }

  // ===========================================================================
  // Full On-Chain Registration
  // ===========================================================================

  /**
   * Register (or re-deploy) a workspace agent on-chain as an ERC-8004 identity.
   *
   * This is a high-level method that orchestrates the entire deployment:
   * 1. Reads workspace wallet and callable triggers
   * 2. Builds the ERC-8004 agent card JSON
   * 3. Uploads the agent card to IPFS via a presigned Pinata URL
   * 4. Registers on-chain (first deploy) or updates the URI (re-deploy)
   * 5. Saves the deployment state to the platform
   *
   * @param params.workflowId - The workflow (workspace) ID
   * @param params.privateKey - Funded private key for on-chain transactions (must have ETH for gas)
   * @param params.chainId - Chain ID (default: 8453 for Base mainnet)
   * @param params.rpcUrl - RPC URL (default: "https://mainnet.base.org")
   * @param params.name - Agent name override (falls back to "ERC-8004 Agent")
   * @param params.description - Agent description override
   * @returns Deployment result with agentId, IPFS CID, transaction hash, and URLs
   *
   * @example
   * ```typescript
   * const result = await client.erc8004.registerOnChain({
   *   workflowId: 123,
   *   privateKey: '0x...',
   *   name: 'My AI Agent',
   *   description: 'An agent that does amazing things',
   * });
   * console.log(result.agentId);        // "8453:42"
   * console.log(result.txHash);          // "0xabc..."
   * console.log(result.ipfsCid);         // "bafkrei..."
   * console.log(result.blockExplorerUrl); // "https://basescan.org/tx/0xabc..."
   * ```
   */
  async registerOnChain(params: {
    workflowId: number;
    privateKey: string;
    chainId?: number;
    rpcUrl?: string;
    name?: string;
    description?: string;
  }): Promise<RegisterOnChainResult> {
    const {
      workflowId,
      privateKey,
      chainId = 8453,
      rpcUrl = "https://mainnet.base.org",
      name = "ERC-8004 Agent",
      description = "Agent registered via OpenServ Platform",
    } = params;

    // 1. Get wallet and callable triggers
    const wallet = await this.getWallet({ workflowId });
    const callableTriggers = await this.getCallableTriggers({ workflowId });

    // 2. Build ERC-8004 agent card
    const services = callableTriggers.map((t) => ({
      name: "WEB",
      endpoint: t.webEndpoint,
      triggerName: t.name,
      description: t.description ?? undefined,
      ...(t.httpEndpoint
        ? { httpEndpoint: t.httpEndpoint, inputSchema: t.inputSchema }
        : {}),
    }));

    if (wallet.address) {
      services.push({
        name: "agentWallet",
        endpoint: `eip155:${chainId}:${wallet.address}`,
        triggerName: undefined as unknown as string,
        description: undefined,
      });
    }

    const agentCard = {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name,
      description,
      services,
      active: true,
      x402support: true,
    };
    const agentCardJson = JSON.stringify(agentCard);

    // 3. Detect first deploy vs re-deploy
    const existingAgentId = wallet.erc8004AgentId;
    const isRedeploy = !!existingAgentId;

    // 4. Save initial state
    await this.deploy({
      workflowId,
      erc8004AgentId: existingAgentId ?? "",
      stringifiedAgentCard: agentCardJson,
      ...(wallet.address ? { walletAddress: wallet.address } : {}),
      network: "base",
      chainId,
      rpcUrl,
    });

    // 5. Upload to IPFS
    const { url: presignedUrl } = await this.presignIpfsUrl({ workflowId });
    const ipfsCid = await this.uploadToIpfs(agentCardJson, presignedUrl);

    // 6. On-chain registration
    const contracts = getErc8004Contracts(chainId);
    const chainConfig = getErc8004Chain(chainId);
    const registryAddress = contracts.IDENTITY_REGISTRY as Address;

    // Build a viem Chain from the ERC-8004 chain config
    const viemChain: Chain = chainConfig
      ? defineChain({
          id: chainConfig.chainId,
          name: chainConfig.name,
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: {
            default: { http: [rpcUrl] },
          },
          blockExplorers: {
            default: {
              name: chainConfig.name,
              url: chainConfig.blockExplorerUrl,
            },
          },
          testnet: chainConfig.testnet,
        })
      : defineChain({
          id: chainId,
          name: `Chain ${chainId}`,
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: {
            default: { http: [rpcUrl] },
          },
        });

    const normalizedKey = (
      privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
    ) as Hex;
    const account = privateKeyToAccount(normalizedKey);
    const publicClient = createPublicClient({
      chain: viemChain,
      transport: http(rpcUrl),
    });
    const walletClient = createWalletClient({
      account,
      chain: viemChain,
      transport: http(rpcUrl),
    });

    let agentId: string;
    let txHash: string;

    if (isRedeploy) {
      // Re-deploy: just update the URI
      const tokenId = existingAgentId.split(":")[1];
      if (!tokenId) {
        throw new Error(`Invalid existing agentId format: ${existingAgentId}`);
      }

      const hash = await walletClient.writeContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "setAgentURI",
        args: [BigInt(tokenId), `ipfs://${ipfsCid}`],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      txHash = hash;
      agentId = existingAgentId;
    } else {
      // First deploy: register then set URI
      const registerHash = await walletClient.writeContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "register",
        args: [],
      });

      const registerReceipt = await publicClient.waitForTransactionReceipt({
        hash: registerHash,
      });

      // Extract agentId from Registered or Transfer event
      const tokenId = this.extractAgentIdFromReceipt(
        registerReceipt.logs,
        registryAddress,
      );
      agentId = `${chainId}:${tokenId}`;

      // Set the IPFS URI
      const uriHash = await walletClient.writeContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "setAgentURI",
        args: [BigInt(tokenId), `ipfs://${ipfsCid}`],
      });

      await publicClient.waitForTransactionReceipt({ hash: uriHash });
      txHash = uriHash;
    }

    // 7. Save final state
    await this.deploy({
      workflowId,
      erc8004AgentId: agentId,
      stringifiedAgentCard: agentCardJson,
      latestDeploymentTransactionHash: txHash,
      latestDeploymentTimestamp: new Date(),
      ...(wallet.address ? { walletAddress: wallet.address } : {}),
      network: "base",
      chainId,
      rpcUrl,
    });

    const blockExplorerUrl = chainConfig
      ? `${chainConfig.blockExplorerUrl}/tx/${txHash}`
      : `https://basescan.org/tx/${txHash}`;

    return {
      agentId,
      ipfsCid,
      txHash,
      agentCardUrl: `https://gateway.pinata.cloud/ipfs/${ipfsCid}`,
      blockExplorerUrl,
    };
  }

  /**
   * Upload a JSON string to IPFS using a presigned Pinata URL.
   */
  private async uploadToIpfs(
    jsonContent: string,
    presignedUrl: string,
  ): Promise<string> {
    const pinata = new PinataSDK({
      pinataJwt: "",
      pinataGateway: "gateway.pinata.cloud",
    });

    const file = new File([jsonContent], "registration.json", {
      type: "application/json",
    });

    const response = await pinata.upload.public.file(file).url(presignedUrl);

    const cid = response.cid;
    if (!cid) {
      throw new Error(
        `No CID returned from Pinata. Response: ${JSON.stringify(response)}`,
      );
    }

    return cid;
  }

  /**
   * Extract the agent token ID from a registration transaction receipt.
   * Looks for the Registered event first, then falls back to Transfer event.
   */
  private extractAgentIdFromReceipt(
    logs: readonly { topics: readonly Hex[]; data: Hex; address: Address }[],
    registryAddress: Address,
  ): string {
    // Try Registered event first
    for (const log of logs) {
      if (log.address.toLowerCase() !== registryAddress.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: IDENTITY_REGISTRY_ABI,
          data: log.data,
          topics: log.topics as [Hex, ...Hex[]],
        });
        if (decoded.eventName === "Registered") {
          const args = decoded.args as unknown as { agentId: bigint };
          return args.agentId.toString();
        }
      } catch {
        // Not this event, try next
      }
    }

    // Fallback to Transfer event (ERC-721 mint: from=0x0)
    for (const log of logs) {
      if (log.address.toLowerCase() !== registryAddress.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: IDENTITY_REGISTRY_ABI,
          data: log.data,
          topics: log.topics as [Hex, ...Hex[]],
        });
        if (decoded.eventName === "Transfer") {
          const args = decoded.args as unknown as { tokenId: bigint };
          return args.tokenId.toString();
        }
      } catch {
        // Not this event, try next
      }
    }

    throw new Error(
      "Could not extract agent ID from transaction receipt. " +
        "No Registered or Transfer event found.",
    );
  }

  /**
   * Get a presigned IPFS URL for uploading an agent registration file.
   *
   * The returned URL is a signed Pinata upload URL that expires in 60 seconds.
   * Use it to upload the agent's registration file (agent card) to IPFS before
   * on-chain registration.
   *
   * @param params - Parameters
   * @param params.workflowId - The workflow (workspace) ID
   * @returns Object containing the presigned IPFS upload URL
   *
   * @example
   * ```typescript
   * const { url } = await client.erc8004.presignIpfsUrl({ workflowId: 123 });
   * // Use the URL to upload agent card to IPFS within 60 seconds
   * ```
   */
  async presignIpfsUrl(params: {
    workflowId: number;
  }): Promise<PresignIpfsUrlResponse> {
    return this.client.put<PresignIpfsUrlResponse>(
      `/workspaces/${params.workflowId}/erc-8004/presign-ipfs-url`,
    );
  }

  // ===========================================================================
  // Web3 Wallet Management
  // ===========================================================================

  /**
   * Get the web3 wallet associated with a workspace.
   *
   * @param params - Parameters
   * @param params.workflowId - The workflow (workspace) ID
   * @returns The web3 wallet details
   *
   * @example
   * ```typescript
   * const wallet = await client.erc8004.getWallet({ workflowId: 123 });
   * console.log(wallet.address, wallet.deployed, wallet.erc8004AgentId);
   * ```
   */
  async getWallet(params: { workflowId: number }): Promise<Web3Wallet> {
    return this.client.get<Web3Wallet>(`/workspaces/${params.workflowId}/web3`);
  }

  /**
   * Generate a new web3 wallet for a workspace.
   *
   * Creates a fresh wallet with a server-generated private key. The wallet
   * is stored securely on the platform and used for ERC-8004 operations.
   * A workspace can only have one web3 wallet.
   *
   * @param params - Parameters
   * @param params.workflowId - The workflow (workspace) ID
   * @returns The generated web3 wallet
   * @throws Error if the workspace already has a web3 wallet
   *
   * @example
   * ```typescript
   * const wallet = await client.erc8004.generateWallet({ workflowId: 123 });
   * console.log('Wallet address:', wallet.address);
   * ```
   */
  async generateWallet(params: { workflowId: number }): Promise<Web3Wallet> {
    return this.client.post<Web3Wallet>(
      `/workspaces/${params.workflowId}/web3/generate`,
    );
  }

  /**
   * Import an existing web3 wallet into a workspace.
   *
   * Use this to associate a pre-existing wallet (e.g., one that already has
   * an ERC-8004 registration) with a workspace.
   * A workspace can only have one web3 wallet.
   *
   * @param params - Import parameters
   * @param params.workflowId - The workflow (workspace) ID
   * @param params.address - Wallet address
   * @param params.network - Network name (e.g., "base")
   * @param params.chainId - Chain ID (e.g., 8453)
   * @param params.privateKey - Wallet private key
   * @returns The imported web3 wallet
   * @throws Error if the workspace already has a web3 wallet
   *
   * @example
   * ```typescript
   * const wallet = await client.erc8004.importWallet({
   *   workflowId: 123,
   *   address: '0x...',
   *   network: 'base',
   *   chainId: 8453,
   *   privateKey: '0x...',
   * });
   * ```
   */
  async importWallet(
    params: ImportWeb3WalletRequest & { workflowId: number },
  ): Promise<Web3Wallet> {
    const { workflowId, ...body } = params;
    return this.client.post<Web3Wallet>(
      `/workspaces/${workflowId}/web3/import`,
      body,
    );
  }

  /**
   * Delete the web3 wallet associated with a workspace.
   *
   * This removes the wallet record from the platform. Note that the on-chain
   * ERC-8004 registration is not affected -- this only removes the platform's
   * association.
   *
   * @param params - Parameters
   * @param params.workflowId - The workflow (workspace) ID
   *
   * @example
   * ```typescript
   * await client.erc8004.deleteWallet({ workflowId: 123 });
   * ```
   */
  async deleteWallet(params: { workflowId: number }): Promise<void> {
    await this.client.delete(`/workspaces/${params.workflowId}/web3`);
  }

  /**
   * Sign a feedback auth message for a buyer address.
   *
   * This is used for the ERC-8004 reputation system. The workspace's web3 wallet
   * signs an auth message that allows a buyer to submit feedback/reputation
   * for the agent on-chain.
   *
   * @param params - Parameters
   * @param params.workflowId - The workflow (workspace) ID
   * @param params.buyerAddress - The buyer's wallet address to authorize
   * @returns Object containing the signed feedback auth
   *
   * @example
   * ```typescript
   * const { signature } = await client.erc8004.signFeedbackAuth({
   *   workflowId: 123,
   *   buyerAddress: '0xBuyer...',
   * });
   * ```
   */
  async signFeedbackAuth(params: {
    workflowId: number;
    buyerAddress: string;
  }): Promise<SignFeedbackAuthResponse> {
    return this.client.post<SignFeedbackAuthResponse>(
      `/workspaces/${params.workflowId}/web3/sign-feedback-auth`,
      { buyerAddress: params.buyerAddress },
    );
  }

  // ===========================================================================
  // Callable Triggers
  // ===========================================================================

  /**
   * Get callable triggers for a workspace.
   *
   * Returns the list of triggers that can be called externally, along with
   * their input schemas and endpoint URLs. This is used during ERC-8004
   * deployment to register the agent's available services on-chain.
   *
   * @param params - Parameters
   * @param params.workflowId - The workflow (workspace) ID
   * @returns Array of callable triggers with their schemas and endpoints
   *
   * @example
   * ```typescript
   * const triggers = await client.erc8004.getCallableTriggers({ workflowId: 123 });
   * for (const trigger of triggers) {
   *   console.log(trigger.name, trigger.webEndpoint);
   * }
   * ```
   */
  async getCallableTriggers(params: {
    workflowId: number;
  }): Promise<CallableTrigger[]> {
    return this.client.get<CallableTrigger[]>(
      `/workspaces/${params.workflowId}/callable-triggers`,
    );
  }
}

/**
 * Result of a successful on-chain ERC-8004 registration.
 */
export interface RegisterOnChainResult {
  /** ERC-8004 agent ID in format "chainId:tokenId" (e.g., "8453:42") */
  agentId: string;
  /** IPFS CID of the uploaded agent card */
  ipfsCid: string;
  /** Transaction hash of the final on-chain transaction */
  txHash: string;
  /** URL to view the agent card on IPFS */
  agentCardUrl: string;
  /** URL to view the transaction on the block explorer */
  blockExplorerUrl: string;
}
