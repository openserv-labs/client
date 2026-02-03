import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment, createSigner } from "x402-fetch";
import type { PlatformClient } from "./client";
import type { X402PaymentRequest, X402PaymentResult } from "./types";

/**
 * API for making x402 payments to access paid workflows.
 *
 * The x402 protocol allows workflows to be monetized - users pay to trigger them.
 * This API provides methods to pay for and execute x402-protected workflows programmatically.
 *
 * @example
 * ```typescript
 * const client = new PlatformClient();
 *
 * // Pay and execute an x402 workflow in one call - only wallet key needed!
 * const result = await client.payments.payWorkflow({
 *   triggerUrl: 'https://api.openserv.ai/webhooks/x402/trigger/...',
 *   input: { query: 'Hello world' }
 * });
 *
 * console.log(result.response); // Workflow response
 * ```
 */
export class PaymentsAPI {
  constructor(private client: PlatformClient) {}

  /**
   * Pay for and execute an x402-protected workflow.
   *
   * This method handles the entire x402 payment flow automatically:
   * 1. Creates a payment-enabled fetch wrapper using your wallet
   * 2. Makes a request to the trigger URL
   * 3. Automatically handles the 402 Payment Required response
   * 4. Signs and submits the payment
   * 5. Retries the request with payment proof
   * 6. Returns the workflow response
   *
   * @param params - Payment parameters
   * @param params.triggerUrl - The x402 trigger URL (webhookUrl from x402-services API or trigger.webhookUrl)
   * @param params.privateKey - Wallet private key for payment (or uses WALLET_PRIVATE_KEY env var)
   * @param params.input - Input data to pass to the workflow
   * @returns Payment result with workflow response
   *
   * @example
   * ```typescript
   * // Using environment variable for private key
   * const result = await client.payments.payWorkflow({
   *   triggerUrl: 'https://api.openserv.ai/webhooks/x402/trigger/abc123',
   *   input: { prompt: 'Generate a summary' }
   * });
   *
   * console.log(result.response); // Workflow execution result
   * ```
   *
   * @example
   * ```typescript
   * // Explicitly providing private key
   * const result = await client.payments.payWorkflow({
   *   triggerUrl: workflow.triggers[0].webhookUrl,
   *   privateKey: '0x...',
   *   input: { query: 'What is the weather?' }
   * });
   * ```
   */
  async payWorkflow(params: X402PaymentRequest): Promise<X402PaymentResult> {
    const privateKey = params.privateKey || process.env.WALLET_PRIVATE_KEY;

    if (!privateKey) {
      throw new Error(
        "Private key is required. Provide it as a parameter or set WALLET_PRIVATE_KEY env var.",
      );
    }

    // Create account from private key (for getting address)
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    // Create signer for x402 payments on Base network
    const signer = await createSigner("base", privateKey);

    // Wrap fetch with x402 payment handling
    const x402Fetch = wrapFetchWithPayment(fetch, signer);

    // Make the request - x402Fetch automatically handles 402 responses
    const response = await x402Fetch(params.triggerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerAddress: account.address,
        payload: params.input || {},
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Workflow execution failed: ${response.status} ${JSON.stringify(errorData)}`,
      );
    }

    const responseData = await response.json();

    return {
      success: true,
      txHash: "", // x402 handles this internally, tx hash not exposed
      price: "", // Price is handled by x402 protocol
      response: responseData,
      network: "base",
      chainId: 8453,
    };
  }

  /**
   * Discover available x402 services from the platform.
   *
   * Lists all public x402-enabled workflows that can be paid for and executed.
   * Each service includes pricing, input schema, and the webhook URL to call.
   *
   * @returns Array of available x402 services
   *
   * @example
   * ```typescript
   * const services = await client.payments.discoverServices();
   *
   * for (const service of services) {
   *   console.log(`${service.name}: $${service.x402Pricing}`);
   *   console.log(`URL: ${service.webhookUrl}`);
   * }
   * ```
   */
  async discoverServices(): Promise<
    Array<{
      id: string;
      name: string;
      description: string | null;
      x402Pricing: string;
      webhookUrl: string;
      workspaceName: string;
      ownerDisplayName: string;
    }>
  > {
    const response = await this.client.get<{
      services: Array<{
        id: string;
        name: string;
        description: string | null;
        x402Pricing: string;
        inputSchema: Record<string, unknown>;
        paywallUrl: string;
        webhookUrl: string;
        workspaceName: string;
        ownerDisplayName: string;
        createdAt: string;
      }>;
    }>("/x402-services");

    return response.services;
  }

  /**
   * Get preflight information for an x402 trigger.
   *
   * Returns pricing, input schema, and wallet information for a trigger
   * before making a payment. Useful for displaying payment UI.
   *
   * @param params - Parameters object
   * @param params.token - The trigger token (from the webhook URL path)
   * @returns Trigger preflight information including pricing and schema
   *
   * @example
   * ```typescript
   * // Extract token from webhook URL: .../trigger/{token}
   * const preflight = await client.payments.getTriggerPreflight({
   *   token: 'abc123def456'
   * });
   *
   * console.log(`Price: ${preflight.x402Pricing}`);
   * console.log(`Pay to: ${preflight.x402WalletAddress}`);
   * ```
   */
  async getTriggerPreflight(params: { token: string }): Promise<{
    triggerId: string;
    triggerName: string;
    triggerDescription: string | null;
    jsonSchema: Record<string, unknown>;
    uiSchema: Record<string, unknown>;
    x402Enabled: boolean;
    x402Pricing: string;
    x402WalletAddress: string;
    erc8004AgentId: string | null;
  }> {
    // This endpoint is public and doesn't require authentication
    const response = await fetch(
      `https://api.openserv.ai/webhooks/trigger/${params.token}`,
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Failed to get trigger preflight: ${response.status} ${JSON.stringify(errorData)}`,
      );
    }

    return response.json();
  }
}
