/**
 * Vendored x402 EVM client-side payment implementation.
 *
 * This replaces the `x402-fetch` and `x402` npm packages to avoid pulling in
 * wagmi, WalletConnect, Reown, MetaMask SDK, Solana SDK, and hundreds of MB
 * of transitive dependencies that are unnecessary for server-side EVM usage.
 *
 * Only EVM payment support is included (Base network), which is all this SDK needs.
 * The x402 protocol specification: https://www.x402.org/
 *
 * @module
 */

import {
  createWalletClient,
  http,
  getAddress,
  toHex,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { randomBytes } from "node:crypto";
import { normalizePrivateKey } from "./utils";

// ============================================================================
// Types
// ============================================================================

/** Payment requirements returned by an x402-enabled server in a 402 response. */
interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: {
    name?: string;
    version?: string;
  };
}

/** EIP-3009 TransferWithAuthorization parameters. */
interface Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
}

/** Signed EVM payment payload for x402. */
interface EvmPaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string | undefined;
    authorization: Authorization;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Map network names to viem Chain objects. */
const NETWORK_CHAINS: Record<string, Chain> = {
  base,
  "base-sepolia": baseSepolia,
};

/**
 * EIP-712 typed data for USDC TransferWithAuthorization (EIP-3009).
 * Used to sign USDC transfer authorizations without an on-chain transaction.
 */
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// ============================================================================
// Helpers
// ============================================================================

function base64Encode(str: string): string {
  return Buffer.from(str).toString("base64");
}

function createNonce(): `0x${string}` {
  return toHex(randomBytes(32));
}

function encodePayment(payment: EvmPaymentPayload): string {
  const safe = {
    ...payment,
    payload: {
      ...payment.payload,
      authorization: Object.fromEntries(
        Object.entries(payment.payload.authorization).map(([key, value]) => [
          key,
          typeof value === "bigint" ? value.toString() : value,
        ]),
      ),
    },
  };
  return base64Encode(JSON.stringify(safe));
}

// ============================================================================
// Payment Logic
// ============================================================================

/**
 * Select the best payment requirement from the server's options.
 * Prefers requirements matching the wallet's network and "exact" scheme.
 */
function selectPaymentRequirements(
  requirements: PaymentRequirements[],
  network: string | undefined,
): PaymentRequirements {
  if (network) {
    const matching = requirements.filter(
      (r) => r.scheme === "exact" && r.network === network,
    );
    if (matching.length > 0) return matching[0]!;
  }

  // Fallback: first "exact" scheme requirement, then any
  const exact = requirements.filter((r) => r.scheme === "exact");
  return exact[0] ?? requirements[0]!;
}

/**
 * Sign an EIP-3009 TransferWithAuthorization using the wallet client.
 */
async function signAuthorization(
  walletClient: WalletClient,
  authorization: Authorization,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  const chainId = walletClient.chain?.id;
  if (!chainId) {
    throw new Error("Wallet client must have a chain configured");
  }

  const signature = await walletClient.signTypedData({
    account: walletClient.account!,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    domain: {
      name: paymentRequirements.extra?.name,
      version: paymentRequirements.extra?.version,
      chainId,
      verifyingContract: getAddress(paymentRequirements.asset),
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: getAddress(authorization.from),
      to: getAddress(authorization.to),
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  });

  return signature;
}

/**
 * Create a signed x402 payment header for an EVM payment.
 */
async function createPaymentHeader(
  walletClient: WalletClient,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<string> {
  const from = walletClient.account!.address;

  const nonce = createNonce();
  const validAfter = BigInt(Math.floor(Date.now() / 1000) - 600).toString();
  const validBefore = BigInt(
    Math.floor(Date.now() / 1000 + paymentRequirements.maxTimeoutSeconds),
  ).toString();

  const unsignedPayment: EvmPaymentPayload = {
    x402Version,
    scheme: paymentRequirements.scheme,
    network: paymentRequirements.network,
    payload: {
      signature: undefined,
      authorization: {
        from,
        to: paymentRequirements.payTo,
        value: paymentRequirements.maxAmountRequired,
        validAfter,
        validBefore,
        nonce,
      },
    },
  };

  const signature = await signAuthorization(
    walletClient,
    unsignedPayment.payload.authorization,
    paymentRequirements,
  );

  return encodePayment({
    ...unsignedPayment,
    payload: {
      ...unsignedPayment.payload,
      signature,
    },
  });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a viem WalletClient configured for x402 payment signing.
 *
 * @param network - Network name (e.g., "base", "base-sepolia")
 * @param privateKey - Hex-encoded private key
 * @returns Configured WalletClient
 */
export function createSigner(
  network: string,
  privateKey: string,
): WalletClient {
  const chain = NETWORK_CHAINS[network];
  if (!chain) {
    throw new Error(
      `Unsupported network: ${network}. Supported: ${Object.keys(NETWORK_CHAINS).join(", ")}`,
    );
  }

  return createWalletClient({
    account: privateKeyToAccount(normalizePrivateKey(privateKey)),
    chain,
    transport: http(),
  });
}

/**
 * Wrap a fetch function with x402 payment handling.
 *
 * When the wrapped fetch receives a 402 response, it automatically:
 * 1. Parses the payment requirements from the response
 * 2. Signs an EIP-3009 TransferWithAuthorization
 * 3. Retries the request with the signed payment in the X-PAYMENT header
 *
 * The retry calls the raw (unwrapped) fetch directly, so a second 402
 * is returned to the caller as-is without infinite retry loops.
 *
 * @param fetchFn - The fetch function to wrap
 * @param walletClient - Wallet client for signing payments
 * @param maxValue - Maximum payment amount in atomic units (default: 0.1 USDC = 100000)
 * @returns Wrapped fetch function with x402 payment support
 */
export function wrapFetchWithPayment(
  fetchFn: typeof fetch,
  walletClient: WalletClient,
  maxValue: bigint = BigInt(0.1 * 10 ** 6),
): typeof fetch {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const response = await fetchFn(input, init);

    if (response.status !== 402) {
      return response;
    }

    // Parse payment requirements from 402 response
    const body = (await response.json()) as {
      x402Version: number;
      accepts: PaymentRequirements[];
    };

    // Detect wallet's network name from chain ID
    const chainId = walletClient.chain?.id;
    const network = chainId
      ? Object.entries(NETWORK_CHAINS).find(([, c]) => c.id === chainId)?.[0]
      : undefined;

    const selected = selectPaymentRequirements(body.accepts, network);

    if (BigInt(selected.maxAmountRequired) > maxValue) {
      throw new Error("Payment amount exceeds maximum allowed");
    }

    const paymentHeader = await createPaymentHeader(
      walletClient,
      body.x402Version,
      selected,
    );

    // Retry with payment header using raw fetchFn (not the wrapper) to avoid loops
    return fetchFn(input, {
      ...init,
      headers: {
        ...((init?.headers as Record<string, string>) || {}),
        "X-PAYMENT": paymentHeader,
        "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
      },
    });
  };
}
