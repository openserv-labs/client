/**
 * Minimal IdentityRegistry ABI for ERC-8004 on-chain operations.
 *
 * Contains only the functions needed for agent registration:
 * - register() — mint a new agent NFT
 * - register(string agentURI) — mint and set URI in one transaction
 * - setAgentURI() — set/update the IPFS URI for an agent
 * - tokenURI() — read the current URI (for verification)
 * - Registered event — extract agentId from registration receipt
 * - Transfer event — fallback for extracting agentId
 *
 * Sourced from the full ABI in the OpenServ monorepo:
 * packages/ai/agent0/core/contracts.ts
 */
export const IDENTITY_REGISTRY_ABI = [
  // register() — no-args overload, mints a new agent ID
  {
    inputs: [],
    name: "register",
    outputs: [{ internalType: "uint256", name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  // register(string agentURI) — mints and sets URI in one transaction
  {
    inputs: [{ internalType: "string", name: "agentURI", type: "string" }],
    name: "register",
    outputs: [{ internalType: "uint256", name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  // setAgentURI(uint256 agentId, string newURI)
  {
    inputs: [
      { internalType: "uint256", name: "agentId", type: "uint256" },
      { internalType: "string", name: "newURI", type: "string" },
    ],
    name: "setAgentURI",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // tokenURI(uint256 tokenId) — read the IPFS URI for verification
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  // Registered event — emitted on register()
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "agentURI",
        type: "string",
      },
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "Registered",
    type: "event",
  },
  // URIUpdated event — emitted on setAgentURI()
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "newURI",
        type: "string",
      },
      {
        indexed: true,
        internalType: "address",
        name: "updatedBy",
        type: "address",
      },
    ],
    name: "URIUpdated",
    type: "event",
  },
  // Transfer event (ERC-721) — fallback for extracting agentId
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
] as const;
