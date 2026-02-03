import { ethers } from "ethers";
import type { PlatformClient } from "./client";
import type {
  UsdcTopupConfig,
  UsdcTopupResult,
  UsdcVerifyRequest,
  UsdcVerifyResponse,
} from "./types";

// ERC20 Transfer ABI (minimal)
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

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

    // Step 2: Create wallet and connect to the chain
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Step 3: Check USDC balance
    const usdcContract = new ethers.Contract(
      config.usdcContractAddress,
      ERC20_ABI,
      wallet,
    );

    // USDC has 6 decimals
    const amountInSmallestUnit = ethers.parseUnits(
      params.amountUsd.toString(),
      6,
    );
    const balance: bigint = await usdcContract.getFunction("balanceOf")(
      wallet.address,
    );

    if (balance < amountInSmallestUnit) {
      const balanceFormatted = ethers.formatUnits(balance, 6);
      throw new Error(
        `Insufficient USDC balance. Have: ${balanceFormatted} USDC, need: ${params.amountUsd} USDC`,
      );
    }

    // Step 4: Send USDC transfer
    const tx = await usdcContract.getFunction("transfer")(
      config.receiverAddress,
      amountInSmallestUnit,
    );

    // Step 5: Wait for confirmation
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new Error("Transaction failed or was reverted");
    }

    const txHash = receipt.hash as `0x${string}`;

    // Step 6: Sign verification message
    const verificationMessage = `Verify USDC top-up: ${txHash}`;
    const signature = await wallet.signMessage(verificationMessage);

    // Step 7: Verify transaction and add credits
    const verifyResult = await this.verifyUsdcTransaction({
      txHash,
      payerAddress: wallet.address,
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
