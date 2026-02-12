import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseUnits,
  formatUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { PlatformClient } from "./client";
import { normalizePrivateKey } from "./utils";
import type {
  UsdcTopupConfig,
  UsdcTopupResult,
  UsdcVerifyRequest,
  UsdcVerifyResponse,
} from "./types";

// ERC20 ABI (minimal, for balance check and transfer)
const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Known RPC URLs for supported chains
const CHAIN_RPC_URLS: Record<number, string> = {
  8453: "https://mainnet.base.org", // Base mainnet
};

/**
 * API for Web3 operations including USDC top-up for credits.
 *
 * @example
 * ```typescript
 * const client = new PlatformClient();
 *
 * // Simple one-liner to top up with USDC - auto-authenticates with wallet
 * const result = await client.web3.topUp({
 *   privateKey: process.env.WALLET_PRIVATE_KEY,
 *   amountUsd: 10 // $10 worth of USDC
 * });
 * console.log(`Added ${result.creditsAdded} credits`);
 *
 * // Or use the lower-level methods for more control
 * const config = await client.web3.getUsdcTopupConfig();
 * // ... send USDC manually ...
 * const verifyResult = await client.web3.verifyUsdcTransaction({ txHash: '0x...' });
 * ```
 */
export class Web3API {
  constructor(private client: PlatformClient) {}

  /**
   * Get the configuration for USDC top-up payments.
   *
   * Returns the receiver address, USDC contract address, chain ID, and conversion rate
   * needed to send a USDC payment for credit top-up.
   *
   * @returns USDC top-up configuration
   *
   * @example
   * ```typescript
   * const config = await client.web3.getUsdcTopupConfig();
   * // config.receiverAddress - Address to send USDC to
   * // config.usdcContractAddress - USDC token contract
   * // config.chainId - Target chain (e.g., 8453 for Base)
   * // config.network - Network name (e.g., "base")
   * // config.rateUsdcToCredits - 1 USDC = 100_000_000 credits
   * ```
   */
  async getUsdcTopupConfig(): Promise<UsdcTopupConfig> {
    return this.client.get<UsdcTopupConfig>("/config/topup/usdc");
  }

  /**
   * Verify a USDC transaction and add credits to the user's wallet.
   *
   * After sending USDC to the receiver address, call this method with the
   * transaction hash to verify the payment and receive credits.
   *
   * For wallet-authenticated users, the sender address is verified automatically.
   * For email/Google-authenticated users, you must provide a signature proving
   * ownership of the sending wallet.
   *
   * @param params - Verification parameters
   * @param params.txHash - The transaction hash of the USDC transfer
   * @param params.payerAddress - (Optional) For non-wallet users: the address that sent the USDC
   * @param params.signature - (Optional) For non-wallet users: signature over "Verify USDC top-up: {txHash}"
   * @returns Verification result with credits added
   *
   * @example
   * ```typescript
   * // For wallet-authenticated users
   * const result = await client.web3.verifyUsdcTransaction({
   *   txHash: '0xabc123...'
   * });
   *
   * // For email/Google-authenticated users
   * const message = `Verify USDC top-up: ${txHash}`;
   * const signature = await wallet.signMessage(message);
   * const result = await client.web3.verifyUsdcTransaction({
   *   txHash: '0xabc123...',
   *   payerAddress: '0xYourWallet...',
   *   signature
   * });
   *
   * console.log(`Added ${result.creditsAdded} credits (${result.usdcAmount} USDC)`);
   * ```
   */
  async verifyUsdcTransaction(
    params: UsdcVerifyRequest,
  ): Promise<UsdcVerifyResponse> {
    return this.client.post<UsdcVerifyResponse>(
      "/web3/transactions/usdc/verify",
      params,
    );
  }

  /**
   * Top up credits by sending USDC from your wallet.
   *
   * This is a high-level method that handles the entire flow:
   * 1. Auto-authenticates with wallet if no API key is set
   * 2. Fetches the USDC top-up configuration
   * 3. Sends USDC from your wallet to the receiver
   * 4. Waits for transaction confirmation
   * 5. Signs a verification message
   * 6. Verifies the transaction and adds credits
   *
   * @param params - Top-up parameters
   * @param params.privateKey - Wallet private key (or uses WALLET_PRIVATE_KEY env var)
   * @param params.amountUsd - Amount in USD to top up (e.g., 10 for $10)
   * @param params.rpcUrl - (Optional) Custom RPC URL for the chain
   * @returns Top-up result with credits added and transaction details
   *
   * @example
   * ```typescript
   * // Top up $10 worth of credits - only wallet key needed!
   * const result = await client.web3.topUp({
   *   privateKey: process.env.WALLET_PRIVATE_KEY,
   *   amountUsd: 10
   * });
   *
   * console.log(`Transaction: ${result.txHash}`);
   * console.log(`Added ${result.creditsAdded} credits`);
   * console.log(`USDC spent: ${result.usdcAmount}`);
   * ```
   */
  async topUp(params: {
    privateKey?: string;
    amountUsd: number;
    rpcUrl?: string;
  }): Promise<UsdcTopupResult> {
    const privateKey = params.privateKey || process.env.WALLET_PRIVATE_KEY;

    if (!privateKey) {
      throw new Error(
        "Private key is required. Provide it as a parameter or set WALLET_PRIVATE_KEY env var.",
      );
    }

    if (params.amountUsd <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    // Step 0: Auto-authenticate with wallet if no API key is set
    if (!this.client.rawClient.defaults.headers.common["x-openserv-key"]) {
      await this.client.authenticate(privateKey);
    }

    // Step 1: Get USDC top-up configuration
    const config = await this.getUsdcTopupConfig();

    // Get RPC URL for the chain
    const rpcUrl =
      params.rpcUrl ||
      CHAIN_RPC_URLS[config.chainId] ||
      `https://rpc.ankr.com/${config.network}`;

    // Step 2: Create viem clients
    const account = privateKeyToAccount(normalizePrivateKey(privateKey));

    const chain = defineChain({
      id: config.chainId,
      name: config.network,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    // Step 3: Check USDC balance
    // USDC has 6 decimals
    const amountInSmallestUnit = parseUnits(params.amountUsd.toString(), 6);
    const balance = await publicClient.readContract({
      address: config.usdcContractAddress as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });

    if (balance < amountInSmallestUnit) {
      const balanceFormatted = formatUnits(balance, 6);
      throw new Error(
        `Insufficient USDC balance. Have: ${balanceFormatted} USDC, need: ${params.amountUsd} USDC`,
      );
    }

    // Step 4: Send USDC transfer
    const txHash = await walletClient.writeContract({
      address: config.usdcContractAddress as Address,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [config.receiverAddress as Address, amountInSmallestUnit],
    });

    // Step 5: Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    if (receipt.status !== "success") {
      throw new Error("Transaction failed or was reverted");
    }

    // Step 6: Sign verification message
    const verificationMessage = `Verify USDC top-up: ${txHash}`;
    const signature = await account.signMessage({
      message: verificationMessage,
    });

    // Step 7: Verify transaction and add credits
    const verifyResult = await this.verifyUsdcTransaction({
      txHash,
      payerAddress: account.address,
      signature,
    });

    return {
      success: verifyResult.success,
      txHash,
      creditsAdded: verifyResult.creditsAdded,
      usdcAmount: verifyResult.usdcAmount,
      network: config.network,
      chainId: config.chainId,
    };
  }
}
