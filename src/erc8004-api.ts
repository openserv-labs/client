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
  PresignIpfsUrlResponse,
  WorkflowData,
} from "./types";
import { IDENTITY_REGISTRY_ABI } from "./erc8004-abi.js";
import { getErc8004Chain, getErc8004Contracts } from "./erc8004-contracts.js";
import { normalizePrivateKey } from "./utils";

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
 * const wallet = await client.workflows.generateWallet({ id: 123 });
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
      const wallet = await this.client.workflows.getWallet({ id: workflowId });
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
        `Generate one first with client.workflows.generateWallet({ id: ${workflowId} }), ` +
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
   * @param params.name - Agent name override (defaults: single trigger → trigger name, else workspace name)
   * @param params.description - Agent description override (defaults: single trigger → trigger description, else workspace goal + service list)
   * @param params.image - Agent image URL (optional)
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
   * console.log(result.agentId);         // "8453:42"
   * console.log(result.txHash);           // "0xabc..."
   * console.log(result.ipfsCid);          // "bafkrei..."
   * console.log(result.blockExplorerUrl); // "https://basescan.org/tx/0xabc..."
   * console.log(result.scanUrl);          // "https://www.8004scan.io/agents/base/42"
   * ```
   */
  async registerOnChain(params: {
    workflowId: number;
    privateKey: string;
    chainId?: number;
    rpcUrl?: string;
    name?: string;
    description?: string;
    image?: string;
  }): Promise<RegisterOnChainResult> {
    const {
      workflowId,
      privateKey,
      chainId = 8453,
      rpcUrl = "https://mainnet.base.org",
      image,
    } = params;

    // 1. Get wallet, callable triggers, and workspace data
    const [wallet, callableTriggers, workspace] = await Promise.all([
      this.client.workflows.getWallet({ id: workflowId }),
      this.client.triggers.getCallableTriggers({ workflowId }),
      this.client.workflows.get({ id: workflowId }),
    ]);

    // Derive name and description from triggers/workspace (matching monorepo logic)
    let name = params.name;
    let description = params.description;
    if (!name || !description) {
      if (callableTriggers.length === 1 && callableTriggers[0]) {
        const t = callableTriggers[0];
        if (!name) name = t.name || workspace.name;
        if (!description)
          description = t.description || workspace.goal || "Default";
      } else {
        if (!name) name = workspace.name;
        if (!description) {
          const triggerBullets = callableTriggers
            .filter((t) => t.description)
            .map((t) => `- ${t.name}: ${t.description}`)
            .join("\n");
          description = [
            workspace.goal || "Default",
            ...(triggerBullets ? [`\nServices:\n${triggerBullets}`] : []),
          ].join("");
        }
      }
    }

    // 2. Build ERC-8004 agent card (matches monorepo addRegistrationFile format)
    const baseUrl =
      this.client.rawClient.defaults.baseURL || "https://api.openserv.ai";
    const services: Array<Record<string, unknown>> = [];

    for (const t of callableTriggers) {
      const meta: Record<string, unknown> = {};
      if (t.name) meta.triggerName = t.name;
      if (t.description) meta.description = t.description;

      // HTTP endpoint (machine-facing x402 URL)
      if (t.httpEndpoint) {
        const httpMeta: Record<string, unknown> = { ...meta };

        // Build the full request schema including the x402 envelope
        // (buyerAddress + payload wrapping the trigger's own input schema)
        const requestSchema: Record<string, unknown> = {
          type: "object",
          required: ["buyerAddress", "payload"],
          properties: {
            buyerAddress: {
              type: "string",
              description:
                "The buyer's wallet address (e.g. 0x...) for x402 payment",
            },
            payload: t.inputSchema ?? { type: "object" },
          },
        };
        httpMeta.inputSchema = requestSchema;

        services.push({
          name: "http",
          endpoint: t.httpEndpoint,
          ...(Object.keys(httpMeta).length > 0 ? httpMeta : {}),
        });
      }

      // WEB endpoint (human-facing paywall URL)
      services.push({
        name: "web",
        endpoint: t.webEndpoint,
        ...(Object.keys(meta).length > 0 ? meta : {}),
      });
    }

    // MCP endpoint (machine-facing, aggregates all x402 triggers)
    const mcpEndpoint = `${baseUrl}/workspaces/${workflowId}/x402/mcp`;
    services.push({
      name: "MCP",
      endpoint: mcpEndpoint,
      version: "2025-06-18",
    });

    // Add walletAddress as an endpoint (deduplicate first)
    if (wallet.address) {
      const filtered = services.filter(
        (s) => s.name !== "agentWallet" && s.name !== "wallet",
      );
      services.length = 0;
      services.push(...filtered);
      services.push({
        name: "agentWallet",
        endpoint: `eip155:${chainId}:${wallet.address}`,
      });
    }

    // Build registrations array (populated on re-deploy)
    const existingAgentId = wallet.erc8004AgentId;
    const registrations: Array<Record<string, unknown>> = [];
    if (existingAgentId) {
      const [, tokenId] = existingAgentId.split(":");
      if (tokenId) {
        const contracts = getErc8004Contracts(chainId);
        registrations.push({
          agentId: Number.parseInt(tokenId, 10),
          agentRegistry: `eip155:${chainId}:${contracts.IDENTITY_REGISTRY}`,
        });
      }
    }

    const agentCard: Record<string, unknown> = {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name,
      description,
      ...(image && { image }),
      services,
      ...(registrations.length > 0 && { registrations }),
      active: true,
      x402support: true,
    };
    const agentCardJson = JSON.stringify(agentCard);

    // 3. Detect first deploy vs re-deploy
    const isRedeploy = !!wallet.latestDeploymentTransactionHash;

    // 4. On-chain setup
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

    const account = privateKeyToAccount(normalizePrivateKey(privateKey));
    const publicClient = createPublicClient({
      chain: viemChain,
      transport: http(rpcUrl),
    });

    // 5. For re-deploys, check if the agent card has actually changed
    if (isRedeploy) {
      if (!existingAgentId) {
        throw new Error(
          "Wallet has a deployment transaction hash but no agentId — data is inconsistent",
        );
      }
      const tokenId = existingAgentId.split(":")[1];
      if (!tokenId) {
        throw new Error(`Invalid existing agentId format: ${existingAgentId}`);
      }

      // Read the current agentURI from the on-chain contract
      const currentUri = await publicClient.readContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "tokenURI",
        args: [BigInt(tokenId)],
      });

      // Fetch the existing agent card from IPFS and compare
      if (typeof currentUri === "string" && currentUri.startsWith("ipfs://")) {
        const existingCid = currentUri.replace("ipfs://", "");
        try {
          const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${existingCid}`;
          const ipfsResponse = await fetch(gatewayUrl);
          if (ipfsResponse.ok) {
            const existingCard = await ipfsResponse.json();
            const existingCardJson = JSON.stringify(existingCard);

            if (existingCardJson === agentCardJson) {
              // Agent card is unchanged — skip IPFS upload and on-chain write
              const network = chainConfig?.network ?? "base";
              const scanUrl = `https://www.8004scan.io/agents/${network}/${tokenId}`;

              return {
                agentId: existingAgentId,
                ipfsCid: existingCid,
                txHash: "",
                agentCardUrl: gatewayUrl,
                blockExplorerUrl: "",
                scanUrl,
              };
            }
          }
        } catch {
          // If fetching from IPFS fails, proceed with re-deploy
        }
      }
    }

    // 6. Save initial state
    await this.deploy({
      workflowId,
      erc8004AgentId: existingAgentId ?? "",
      stringifiedAgentCard: agentCardJson,
      ...(wallet.address ? { walletAddress: wallet.address } : {}),
      network: "base",
      chainId,
      rpcUrl,
    });

    // 7. Upload to IPFS
    const { url: presignedUrl } = await this.presignIpfsUrl({ workflowId });
    const ipfsCid = await this.uploadToIpfs(agentCardJson, presignedUrl);

    // 8. On-chain registration
    const walletClient = createWalletClient({
      account,
      chain: viemChain,
      transport: http(rpcUrl),
    });

    let agentId: string;
    let txHash: string;

    if (isRedeploy) {
      if (!existingAgentId) {
        throw new Error(
          "Wallet has a deployment transaction hash but no agentId — data is inconsistent",
        );
      }

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
      // First deploy: register with URI in a single transaction
      const registerHash = await walletClient.writeContract({
        address: registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "register",
        args: [`ipfs://${ipfsCid}`],
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
      txHash = registerHash;
    }

    // 9. Save final state
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

    const network = chainConfig?.network ?? "base";
    const tokenId = agentId.split(":")[1];
    const scanUrl = `https://www.8004scan.io/agents/${network}/${tokenId}`;

    return {
      agentId,
      ipfsCid,
      txHash,
      agentCardUrl: `https://gateway.pinata.cloud/ipfs/${ipfsCid}`,
      blockExplorerUrl,
      scanUrl,
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
  /** URL to view the agent on 8004scan.io (e.g., "https://www.8004scan.io/agents/base/42") */
  scanUrl: string;
}
