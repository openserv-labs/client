/**
 * ERC-8004 contract addresses and chain configuration.
 *
 * Contract addresses sourced from the official erc-8004-contracts repository:
 * https://github.com/erc-8004/erc-8004-contracts
 *
 * All mainnets share the same contract addresses.
 * All testnets share the same contract addresses.
 */

// =============================================================================
// Contract Addresses
// =============================================================================

/** Contract addresses shared across all ERC-8004 mainnets */
export const ERC8004_MAINNET_CONTRACTS = {
  IDENTITY_REGISTRY: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  REPUTATION_REGISTRY: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
} as const;

/** Contract addresses shared across all ERC-8004 testnets */
export const ERC8004_TESTNET_CONTRACTS = {
  IDENTITY_REGISTRY: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  REPUTATION_REGISTRY: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
} as const;

// =============================================================================
// Chain Configuration
// =============================================================================

/** Configuration for an ERC-8004 supported chain */
export interface Erc8004ChainConfig {
  /** Numeric chain ID */
  chainId: number;
  /** Human-readable network name */
  network: string;
  /** Display name */
  name: string;
  /** Whether this is a testnet */
  testnet: boolean;
  /** Default public RPC URL */
  rpcUrl: string;
  /** Block explorer base URL */
  blockExplorerUrl: string;
  /** ERC-8004 contract addresses */
  contracts: {
    IDENTITY_REGISTRY: string;
    REPUTATION_REGISTRY: string;
  };
}

/**
 * All chains where ERC-8004 contracts are deployed.
 *
 * Source: https://github.com/erc-8004/erc-8004-contracts
 */
export const ERC8004_CHAINS: Record<number, Erc8004ChainConfig> = {
  // ---------------------------------------------------------------------------
  // Mainnets
  // ---------------------------------------------------------------------------
  1: {
    chainId: 1,
    network: "ethereum",
    name: "Ethereum",
    testnet: false,
    rpcUrl: "https://eth.llamarpc.com",
    blockExplorerUrl: "https://etherscan.io",
    contracts: ERC8004_MAINNET_CONTRACTS,
  },
  8453: {
    chainId: 8453,
    network: "base",
    name: "Base",
    testnet: false,
    rpcUrl: "https://mainnet.base.org",
    blockExplorerUrl: "https://basescan.org",
    contracts: ERC8004_MAINNET_CONTRACTS,
  },
  137: {
    chainId: 137,
    network: "polygon",
    name: "Polygon",
    testnet: false,
    rpcUrl: "https://polygon-rpc.com",
    blockExplorerUrl: "https://polygonscan.com",
    contracts: ERC8004_MAINNET_CONTRACTS,
  },
  42161: {
    chainId: 42161,
    network: "arbitrum",
    name: "Arbitrum One",
    testnet: false,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    blockExplorerUrl: "https://arbiscan.io",
    contracts: ERC8004_MAINNET_CONTRACTS,
  },
  42220: {
    chainId: 42220,
    network: "celo",
    name: "Celo",
    testnet: false,
    rpcUrl: "https://forno.celo.org",
    blockExplorerUrl: "https://celoscan.io",
    contracts: ERC8004_MAINNET_CONTRACTS,
  },
  100: {
    chainId: 100,
    network: "gnosis",
    name: "Gnosis",
    testnet: false,
    rpcUrl: "https://rpc.gnosischain.com",
    blockExplorerUrl: "https://gnosisscan.io",
    contracts: ERC8004_MAINNET_CONTRACTS,
  },
  534352: {
    chainId: 534352,
    network: "scroll",
    name: "Scroll",
    testnet: false,
    rpcUrl: "https://rpc.scroll.io",
    blockExplorerUrl: "https://scrollscan.com",
    contracts: ERC8004_MAINNET_CONTRACTS,
  },
  167000: {
    chainId: 167000,
    network: "taiko",
    name: "Taiko",
    testnet: false,
    rpcUrl: "https://rpc.mainnet.taiko.xyz",
    blockExplorerUrl: "https://taikoscan.io",
    contracts: ERC8004_MAINNET_CONTRACTS,
  },
  56: {
    chainId: 56,
    network: "bsc",
    name: "BNB Smart Chain",
    testnet: false,
    rpcUrl: "https://bsc-dataseed.binance.org",
    blockExplorerUrl: "https://bscscan.com",
    contracts: ERC8004_MAINNET_CONTRACTS,
  },

  // ---------------------------------------------------------------------------
  // Testnets
  // ---------------------------------------------------------------------------
  11155111: {
    chainId: 11155111,
    network: "ethereum-sepolia",
    name: "Ethereum Sepolia",
    testnet: true,
    rpcUrl: "https://rpc.sepolia.org",
    blockExplorerUrl: "https://sepolia.etherscan.io",
    contracts: ERC8004_TESTNET_CONTRACTS,
  },
  84532: {
    chainId: 84532,
    network: "base-sepolia",
    name: "Base Sepolia",
    testnet: true,
    rpcUrl: "https://sepolia.base.org",
    blockExplorerUrl: "https://sepolia.basescan.org",
    contracts: ERC8004_TESTNET_CONTRACTS,
  },
  80002: {
    chainId: 80002,
    network: "polygon-amoy",
    name: "Polygon Amoy",
    testnet: true,
    rpcUrl: "https://rpc-amoy.polygon.technology",
    blockExplorerUrl: "https://amoy.polygonscan.com",
    contracts: ERC8004_TESTNET_CONTRACTS,
  },
  421614: {
    chainId: 421614,
    network: "arbitrum-sepolia",
    name: "Arbitrum Sepolia",
    testnet: true,
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    blockExplorerUrl: "https://sepolia.arbiscan.io",
    contracts: ERC8004_TESTNET_CONTRACTS,
  },
  44787: {
    chainId: 44787,
    network: "celo-alfajores",
    name: "Celo Alfajores",
    testnet: true,
    rpcUrl: "https://alfajores-forno.celo-testnet.org",
    blockExplorerUrl: "https://alfajores.celoscan.io",
    contracts: ERC8004_TESTNET_CONTRACTS,
  },
  534351: {
    chainId: 534351,
    network: "scroll-sepolia",
    name: "Scroll Sepolia",
    testnet: true,
    rpcUrl: "https://sepolia-rpc.scroll.io",
    blockExplorerUrl: "https://sepolia.scrollscan.com",
    contracts: ERC8004_TESTNET_CONTRACTS,
  },
  97: {
    chainId: 97,
    network: "bsc-testnet",
    name: "BNB Smart Chain Testnet",
    testnet: true,
    rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
    blockExplorerUrl: "https://testnet.bscscan.com",
    contracts: ERC8004_TESTNET_CONTRACTS,
  },
} as const;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the ERC-8004 chain configuration for a given chain ID.
 *
 * @param chainId - The numeric chain ID
 * @returns The chain configuration, or undefined if the chain is not supported
 *
 * @example
 * ```typescript
 * const baseConfig = getErc8004Chain(8453);
 * console.log(baseConfig?.contracts.IDENTITY_REGISTRY);
 * // "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
 * ```
 */
export function getErc8004Chain(
  chainId: number,
): Erc8004ChainConfig | undefined {
  return ERC8004_CHAINS[chainId];
}

/**
 * Get the ERC-8004 contract addresses for a given chain ID.
 *
 * @param chainId - The numeric chain ID
 * @returns The contract addresses
 * @throws Error if the chain ID is not supported
 *
 * @example
 * ```typescript
 * const contracts = getErc8004Contracts(8453);
 * console.log(contracts.IDENTITY_REGISTRY);
 * // "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
 * ```
 */
export function getErc8004Contracts(chainId: number): {
  IDENTITY_REGISTRY: string;
  REPUTATION_REGISTRY: string;
} {
  const chain = ERC8004_CHAINS[chainId];
  if (!chain) {
    throw new Error(
      `ERC-8004 contracts are not configured for chain ID ${chainId}. ` +
        `Supported chains: ${Object.keys(ERC8004_CHAINS).join(", ")}`,
    );
  }
  return chain.contracts;
}

/**
 * List all supported ERC-8004 chain IDs.
 *
 * @param filter - Optional filter: "mainnet", "testnet", or undefined for all
 * @returns Array of supported chain IDs
 *
 * @example
 * ```typescript
 * const allChains = listErc8004ChainIds();
 * const mainnets = listErc8004ChainIds("mainnet");
 * const testnets = listErc8004ChainIds("testnet");
 * ```
 */
export function listErc8004ChainIds(filter?: "mainnet" | "testnet"): number[] {
  return Object.values(ERC8004_CHAINS)
    .filter((chain) => {
      if (filter === "mainnet") return !chain.testnet;
      if (filter === "testnet") return chain.testnet;
      return true;
    })
    .map((chain) => chain.chainId);
}
