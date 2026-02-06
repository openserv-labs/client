# OpenServ Platform Client

[![npm version](https://badge.fury.io/js/@openserv-labs%2Fclient.svg)](https://www.npmjs.com/package/@openserv-labs/client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

A TypeScript client for interacting with the OpenServ Platform API. Manage agents, workflows, tasks, and triggers programmatically.

> **Note**: This is the platform client for API operations. If you want to build AI agents, see [@openserv-labs/sdk](https://github.com/openserv-labs/sdk).

## Installation

```bash
npm install @openserv-labs/client
```

## Quick Start

```typescript
import { PlatformClient } from '@openserv-labs/client'

const client = new PlatformClient({
  apiKey: process.env.OPENSERV_USER_API_KEY
})

// List all agents
const agents = await client.agents.list()

// Create a workflow
const workflow = await client.workflows.create({
  name: 'My Workflow',
  goal: 'Process data automatically',
  agentIds: [123, 456]
})
```

## Authentication

### API Key Authentication

```typescript
const client = new PlatformClient({
  apiKey: 'your-api-key'
})
```

Or set the `OPENSERV_USER_API_KEY` environment variable:

```typescript
const client = new PlatformClient() // Uses OPENSERV_USER_API_KEY env var
```

### Wallet Authentication (SIWE)

Authenticate using an Ethereum wallet (EIP-4361):

```typescript
const client = new PlatformClient()
const apiKey = await client.authenticate(process.env.WALLET_PRIVATE_KEY)
```

## API Reference

### Agents

```typescript
// List all agents
const agents = await client.agents.list()

// Get agent by ID
const agent = await client.agents.get({ id: 123 })

// Search your own agents by name/description
const myAgents = await client.agents.searchOwned({ query: 'my-agent' })

// Search all marketplace agents (semantic search)
const marketplaceResults = await client.agents.listMarketplace({ search: 'data processing' })

// Create an agent
// endpoint_url is optional when using @openserv-labs/sdk v2.0.0+ (auto-set by run())
const agent = await client.agents.create({
  name: 'My Agent',
  capabilities_description: 'Agent capabilities description',
  endpoint_url: 'https://my-agent.example.com' // Optional for dev, required for production
})

// Update an agent
await client.agents.update({
  id: 123,
  name: 'Updated Name',
  capabilities_description: 'Updated description',
  endpoint_url: 'https://new-endpoint.example.com' // Only if changing the endpoint
})

// Delete an agent
await client.agents.delete({ id: 123 })

// Get agent API key
const apiKey = await client.agents.getApiKey({ id: 123 })

// Generate and save auth token for agent security
const { authToken, authTokenHash } = await client.agents.generateAuthToken()
await client.agents.saveAuthToken({ id: 123, authTokenHash })

// List marketplace agents (public agents from other developers)
const marketplace = await client.agents.listMarketplace({
  search: 'data processing', // Optional search query
  page: 1,
  pageSize: 20,
  showPrivateAgents: true // Include your own private agents
})

console.log(`Found ${marketplace.total} agents`)
for (const agent of marketplace.items) {
  console.log(`${agent.name} by ${agent.author_name}`)
}
```

### Workflows

```typescript
// Create a workflow
const workflow = await client.workflows.create({
  name: 'Data Pipeline',
  goal: 'Process and analyze data',
  agentIds: [123, 456]
})

// Get a workflow
const workflow = await client.workflows.get({ id: 789 })

// List all workflows
const workflows = await client.workflows.list()

// Update a workflow
await client.workflows.update({
  id: 789,
  name: 'Updated Pipeline',
  goal: 'New goal'
})

// Delete a workflow
await client.workflows.delete({ id: 789 })

// Set workflow to running state
await client.workflows.setRunning({ id: 789 })

// Create a fully configured workflow with triggers, tasks, and auto-generated edges
const pipeline = await client.workflows.create({
  name: 'Data Pipeline',
  goal: 'Process and analyze data',
  triggers: [triggers.webhook({ waitForCompletion: true, timeout: 300 })],
  tasks: [
    { name: 'ingest', agentId: 123, description: 'Ingest the data' },
    { name: 'analyze', agentId: 456, description: 'Analyze the results' }
  ]
  // Edges auto-generated: trigger -> ingest -> analyze
})

// Sync workflow configuration (update existing)
await client.workflows.sync({
  id: 789,
  triggers: [triggers.webhook({ waitForCompletion: true })],
  tasks: [{ name: 'process', agentId: 123, description: 'Process data' }]
})
```

### Tasks

```typescript
// Create a task
const task = await client.tasks.create({
  workflowId: 789,
  agentId: 123,
  description: 'Process the data',
  body: 'Additional task details',
  dependencies: [456] // Optional task dependencies
})

// Get a task
const task = await client.tasks.get({ workflowId: 789, id: 1 })

// List tasks in a workflow
const tasks = await client.tasks.list({ workflowId: 789 })

// Update a task
await client.tasks.update({
  workflowId: 789,
  id: 1,
  description: 'Updated description',
  status: 'in-progress'
})

// Delete a task
await client.tasks.delete({ workflowId: 789, id: 1 })
```

### Triggers

Use the `triggers` factory to create type-safe trigger configs, then pass them to `workflows.create()` or `workflow.sync()`:

```typescript
import { triggers } from '@openserv-labs/client'

// Webhook trigger
const workflow = await client.workflows.create({
  name: 'My Workflow',
  goal: 'Process requests',
  triggers: [triggers.webhook({ waitForCompletion: true, timeout: 300 })],
  tasks: [{ name: 'process', agentId: 123, description: 'Handle the request' }]
})

// x402 (paid) trigger
const paidWorkflow = await client.workflows.create({
  name: 'Paid Service',
  goal: 'Premium AI service',
  triggers: [triggers.x402({
    name: 'AI Research Assistant',
    description: 'Get comprehensive research reports on any topic powered by AI',
    price: '0.01',
    input: { query: { type: 'string', description: 'Research topic or question' } }
  })],
  tasks: [{ name: 'research', agentId: 123, description: 'Research the topic' }]
})

// Cron (scheduled) trigger
triggers.cron({ schedule: '0 9 * * *', timezone: 'America/New_York' })

// Manual trigger
triggers.manual()
```

#### Low-level Triggers API

For managing individual triggers on existing workflows:

```typescript
// Get a trigger
const trigger = await client.triggers.get({ workflowId: 789, id: 'trigger-id' })

// List triggers
const allTriggers = await client.triggers.list({ workflowId: 789 })

// Activate a trigger
await client.triggers.activate({ workflowId: 789, id: 'trigger-id' })

// Fire a trigger manually
await client.triggers.fire({
  workflowId: 789,
  id: 'trigger-id',
  input: JSON.stringify({ query: 'test' })
})

// Delete a trigger
await client.triggers.delete({ workflowId: 789, id: 'trigger-id' })
```

### Payments (x402)

Pay for and execute x402-protected workflows programmatically.

> **Note**: Set `WALLET_PRIVATE_KEY` in your environment. The client uses it automatically for x402 payments using the [x402 protocol](https://www.x402.org/).

```typescript
// Pay and execute an x402 workflow - just set WALLET_PRIVATE_KEY env var
const client = new PlatformClient()
const result = await client.payments.payWorkflow({
  triggerUrl: 'https://api.openserv.ai/webhooks/x402/trigger/...',
  input: { prompt: 'Generate a summary' }
})

console.log(`Response: ${JSON.stringify(result.response)}`)
```

The `payWorkflow` method handles the entire x402 payment flow automatically:

1. Creates a payment-enabled fetch wrapper using your wallet
2. Makes a request to the trigger URL
3. Automatically handles the 402 Payment Required response
4. Signs and submits the USDC payment on Base
5. Retries the request with payment proof
6. Returns the workflow response

#### Discover x402 services

```typescript
// List available paid services on the platform
const services = await client.payments.discoverServices()

for (const service of services) {
  console.log(`${service.name}: $${service.x402Pricing}`)
  console.log(`URL: ${service.webhookUrl}`)
  console.log(`By: ${service.ownerDisplayName}`)
}
```

#### Get trigger preflight info

```typescript
// Get pricing and input schema before paying
const preflight = await client.payments.getTriggerPreflight({
  token: 'abc123def456' // Extract from webhook URL
})

console.log(`Price: ${preflight.x402Pricing}`)
console.log(`Pay to: ${preflight.x402WalletAddress}`)
console.log(`Input schema: ${JSON.stringify(preflight.jsonSchema)}`)
```

### ERC-8004 (Agent Identity)

ERC-8004 is an on-chain agent identity standard. The `registerOnChain` method handles the entire flow in a single call -- building the agent card, uploading to IPFS, and registering on-chain.

> **Note**: The wallet used for `registerOnChain` must have ETH for gas on the target chain (Base mainnet by default).

```typescript
// Register an agent on-chain in one call
const result = await client.erc8004.registerOnChain({
  workflowId: 123,
  privateKey: process.env.WALLET_PRIVATE_KEY!,
  name: 'My AI Agent',
  description: 'An agent that does amazing things',
})

console.log(result.agentId)         // "8453:42"
console.log(result.txHash)          // "0xabc..."
console.log(result.ipfsCid)         // "bafkrei..."
console.log(result.agentCardUrl)     // "https://gateway.pinata.cloud/ipfs/bafkrei..."
console.log(result.blockExplorerUrl) // "https://basescan.org/tx/0xabc..."
console.log(result.scanUrl)          // "https://www.8004scan.io/agents/base/42"
```

Under the hood, `registerOnChain` does the following:

1. Reads the workspace wallet and callable triggers
2. Builds the ERC-8004 agent card JSON (with services and wallet info)
3. Uploads the agent card to IPFS via a presigned Pinata URL
4. Registers on-chain (first deploy) or updates the URI (re-deploy)
5. Saves the deployment state back to the platform

Re-deploying (updating an existing registration) uses the same call -- it automatically detects whether the workspace already has an `erc8004AgentId` and uploads a fresh agent card with the latest name, description, services, and wallet info, then updates the on-chain URI to point to it. No new token is minted; only the metadata changes.

#### Supported Chains

`registerOnChain` defaults to Base mainnet (`chainId: 8453`). You can target any supported chain:

```typescript
// Deploy on a different chain
const result = await client.erc8004.registerOnChain({
  workflowId: 123,
  privateKey: process.env.WALLET_PRIVATE_KEY!,
  chainId: 42161,                              // Arbitrum One
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  name: 'My Agent',
})
```

**Mainnets:** Ethereum (1), Base (8453), Polygon (137), Arbitrum One (42161), Celo (42220), Gnosis (100), Scroll (534352), Taiko (167000), BNB Smart Chain (56)

**Testnets:** Ethereum Sepolia (11155111), Base Sepolia (84532), Polygon Amoy (80002), Arbitrum Sepolia (421614), Celo Alfajores (44787), Scroll Sepolia (534351), BNB Testnet (97)

You can also query supported chains programmatically:

```typescript
import { listErc8004ChainIds, getErc8004Chain } from '@openserv-labs/client'

const mainnets = listErc8004ChainIds('mainnet')  // [1, 8453, 137, ...]
const testnets = listErc8004ChainIds('testnet')  // [11155111, 84532, ...]

const baseConfig = getErc8004Chain(8453)
console.log(baseConfig?.contracts.IDENTITY_REGISTRY)
// "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
```

#### Low-level ERC-8004 Operations

For more control over individual steps, use the lower-level methods directly:

```typescript
// Generate a web3 wallet for the workspace
const wallet = await client.erc8004.generateWallet({ workflowId: 123 })
console.log('Wallet address:', wallet.address)

// Import an existing wallet
const imported = await client.erc8004.importWallet({
  workflowId: 123,
  address: '0x...',
  network: 'base',
  chainId: 8453,
  privateKey: '0x...'
})

// Get the workspace wallet
const existing = await client.erc8004.getWallet({ workflowId: 123 })
console.log(existing.deployed, existing.erc8004AgentId)

// Delete the workspace wallet
await client.erc8004.deleteWallet({ workflowId: 123 })

// Get a presigned IPFS URL for uploading the agent card
const { url } = await client.erc8004.presignIpfsUrl({ workflowId: 123 })
// Upload agent card to IPFS within 60 seconds using the signed URL

// Deploy to ERC-8004 (before on-chain registration)
await client.erc8004.deploy({
  workflowId: 123,
  erc8004AgentId: '',
  stringifiedAgentCard: JSON.stringify(registrationFile),
  walletAddress: '0x...',
  network: 'base',
  chainId: 8453,
  rpcUrl: 'https://mainnet.base.org'
})

// Deploy to ERC-8004 (after on-chain registration, with tx hash)
await client.erc8004.deploy({
  workflowId: 123,
  erc8004AgentId: '8453:42',
  stringifiedAgentCard: JSON.stringify(updatedRegistrationFile),
  latestDeploymentTransactionHash: '0xabc...',
  latestDeploymentTimestamp: new Date(),
  walletAddress: '0x...',
  network: 'base',
  chainId: 8453,
  rpcUrl: 'https://mainnet.base.org'
})

// Get callable triggers for on-chain service registration
const callableTriggers = await client.erc8004.getCallableTriggers({ workflowId: 123 })
for (const trigger of callableTriggers) {
  console.log(trigger.name, trigger.webEndpoint)
}

// Sign feedback auth for the reputation system
const { signature } = await client.erc8004.signFeedbackAuth({
  workflowId: 123,
  buyerAddress: '0xBuyer...'
})
```

### Integrations

Manage integration connections for triggers and external services.

```typescript
// List all integration connections for your account
const connections = await client.integrations.listConnections()

for (const conn of connections) {
  console.log(`${conn.integrationDisplayName} (${conn.integrationType})`)
  console.log(`  ID: ${conn.id}`)
  console.log(`  Integration: ${conn.integrationName}`)
}

// Create a custom integration connection
await client.integrations.connect({
  identifier: 'webhook-trigger',
  props: {} // Optional properties
})

// Get or create a connection (useful for trigger setup)
const connectionId = await client.integrations.getOrCreateConnection('webhook-trigger')
```

### Web3 / USDC Top-up

Add credits to your account by paying with USDC.

> **Note**: Set `WALLET_PRIVATE_KEY` in your environment. The client uses it automatically for payments and SIWE authentication.

```typescript
// Simple one-liner - just set WALLET_PRIVATE_KEY env var
const client = new PlatformClient()
const result = await client.web3.topUp({ amountUsd: 10 })

console.log(`Transaction: ${result.txHash}`)
console.log(`Added ${result.creditsAdded} credits`)
console.log(`USDC spent: ${result.usdcAmount}`)
console.log(`Network: ${result.network}`)
```

The `topUp` method handles the entire flow:

1. Fetches USDC configuration from the platform
2. Checks your USDC balance
3. Sends USDC to the platform's receiver address
4. Waits for transaction confirmation
5. Signs a verification message
6. Verifies and adds credits to your account

#### Lower-level methods

For more control, use the individual methods:

```typescript
// Get USDC top-up configuration
const config = await client.web3.getUsdcTopupConfig()
console.log(`Send USDC to ${config.receiverAddress} on ${config.network}`)
console.log(`Chain ID: ${config.chainId}`)
console.log(`USDC Contract: ${config.usdcContractAddress}`)
console.log(`Rate: 1 USDC = ${config.rateUsdcToCredits} credits`)

// After sending USDC manually, verify the transaction
const result = await client.web3.verifyUsdcTransaction({
  txHash: '0xabc123...',
  payerAddress: '0xYourWallet...', // Required for non-wallet-authenticated users
  signature: '0x...' // Sign "Verify USDC top-up: {txHash}"
})
console.log(`Added ${result.creditsAdded} credits`)
```

## Workflow Object

When you retrieve a workflow, you get a `Workflow` object with helper methods:

```typescript
const workflow = await client.workflows.get({ id: 789 })

// Access workflow properties
console.log(workflow.id, workflow.name, workflow.goal)
console.log(workflow.status) // 'draft', 'running', etc.
console.log(workflow.triggers) // Array of triggers
console.log(workflow.tasks) // Array of tasks
console.log(workflow.edges) // Graph edges
console.log(workflow.agents) // Assigned agents

// Sync configuration declaratively
await workflow.sync({
  triggers: [{ name: 'api', type: 'webhook' }],
  tasks: [{ name: 'work', agentId: 123, description: 'Do work' }],
  edges: [{ from: 'trigger:api', to: 'task:work' }]
})

// Start the workflow
await workflow.setRunning()
```

## Provision API

The `provision()` function provides a simple way to deploy agents and workflows in one call. It's designed to work seamlessly with [@openserv-labs/sdk](https://github.com/openserv-labs/sdk) for building AI agents.

### About `endpointUrl`

The `endpointUrl` parameter is **optional** when using `@openserv-labs/sdk` v2.0.0+. Here's why:

- **Development**: When you call `run(agent)` from the SDK, it automatically registers your agent with the OpenServ agents proxy (`https://agents-proxy.openserv.ai`), which tunnels requests to your local machine. No `endpointUrl` needed.
- **Production**: If you're deploying your agent to a publicly accessible URL (e.g., your own server, cloud function, or container), provide the `endpointUrl` so the platform knows where to reach your agent.

### Development Example (No endpointUrl)

When developing locally with the SDK, you can omit `endpointUrl`:

```typescript
import { provision, triggers } from '@openserv-labs/client'
import { Agent, run } from '@openserv-labs/sdk'

// Step 1: Provision the agent and workflow (no endpointUrl needed for dev)
const result = await provision({
  agent: {
    name: 'my-agent',
    description: 'Handles API requests'
  },
  workflow: {
    name: 'api-workflow',
    trigger: triggers.webhook({
      input: { query: { type: 'string' } },
      waitForCompletion: true
    }),
    task: {
      description: 'Process incoming API requests and return results'
    }
  }
})

console.log(result.agentId) // Created agent ID
console.log(result.apiKey) // Agent API key
console.log(result.apiEndpoint) // Webhook URL to call

// Step 2: Create and run the agent (SDK auto-updates endpoint to agents-proxy)
const agent = new Agent({
  systemPrompt: 'You are a helpful assistant.'
})

run(agent) // Automatically connects to agents-proxy.openserv.ai
```

### Production Example (With endpointUrl)

When deploying to production with a publicly accessible URL:

```typescript
import { provision, triggers } from '@openserv-labs/client'

const result = await provision({
  agent: {
    name: 'my-agent',
    description: 'Handles API requests',
    endpointUrl: 'https://my-agent.example.com' // Your production URL
  },
  workflow: {
    name: 'api-workflow',
    trigger: triggers.webhook({
      input: { query: { type: 'string' } },
      waitForCompletion: true
    }),
    task: {
      description: 'Process incoming API requests and return results'
    }
  }
})

console.log(result.apiEndpoint) // Webhook URL to call
```

### More Examples

```typescript
import { provision, triggers, isProvisioned, getProvisionedInfo, clearProvisionedState } from '@openserv-labs/client'

// Provision with x402 (paid) trigger - include beautiful name and description
const paidResult = await provision({
  agent: {
    name: 'research-assistant',
    description: 'Premium AI research service',
    endpointUrl: 'https://research-agent.example.com' // Required for production
  },
  workflow: {
    name: 'research-workflow',
    trigger: triggers.x402({
      name: 'AI Research Assistant',
      description: 'Get comprehensive research reports on any topic powered by AI',
      price: '0.01',
      input: { prompt: { type: 'string', description: 'Research topic or question' } }
    }),
    task: {
      description: 'Process research requests and deliver comprehensive reports'
    }
  }
})

console.log(paidResult.paywallUrl) // Public paywall URL for payments

// Check if already provisioned (uses .openserv.json state file)
if (isProvisioned('my-agent', 'api-workflow')) {
  const info = getProvisionedInfo('my-agent', 'api-workflow')
  console.log('Already provisioned:', info)
}

// Clear provisioned state (does not delete from platform)
clearProvisionedState()
```

### Provision with Cron Trigger

```typescript
const cronResult = await provision({
  agent: {
    name: 'scheduled-agent',
    description: 'Runs scheduled tasks',
    endpointUrl: 'https://scheduled-agent.example.com' // Required for production
  },
  workflow: {
    name: 'daily-job',
    trigger: triggers.cron({
      schedule: '0 9 * * *', // Daily at 9 AM
      timezone: 'America/New_York'
    }),
    task: {
      description: 'Execute daily data processing and send reports'
    }
  }
})
```

## Trigger Factory Functions

Use the `triggers` factory for type-safe trigger configuration:

```typescript
import { triggers } from '@openserv-labs/client'

// Each factory accepts user-friendly params and returns a flat, typed config.

// Webhook trigger
triggers.webhook({
  name: 'Data Ingestion Webhook',
  description: 'Receives data from external systems for processing',
  input: { message: { type: 'string' } },
  waitForCompletion: true,
  timeout: 600
})
// { type: 'webhook', name: '...', waitForCompletion: true, timeout: 600, inputSchema: {...} }

// Cron trigger
triggers.cron({
  name: 'Daily Report Generator',
  description: 'Generates daily analytics reports every 6 hours',
  schedule: '0 */6 * * *',
  timezone: 'UTC'
})
// { type: 'cron', name: '...', schedule: '0 */6 * * *', timezone: 'UTC' }

// x402 (paid) trigger — name and description appear in the x402-services listing
triggers.x402({
  name: 'AI Research Assistant',
  description: 'Get comprehensive research reports on any topic powered by AI',
  price: '0.05',
  input: { prompt: { type: 'string', description: 'Research topic or question' } },
  timeout: 300,
  walletAddress: '0x...'
})
// { type: 'x402', name: '...', x402Pricing: '0.05', timeout: 300, x402WalletAddress: '0x...', inputSchema: {...} }

// Manual trigger
triggers.manual({
  name: 'Manual Test Trigger',
  description: 'For testing workflows manually'
})
// { type: 'manual', name: '...', description: '...' }
```

## Environment Variables

| Variable                | Description                           | Required                     |
| ----------------------- | ------------------------------------- | ---------------------------- |
| `OPENSERV_USER_API_KEY` | Your OpenServ user API key            | For most API operations      |
| `OPENSERV_API_URL`      | Custom API URL (for testing)          | No                           |
| `WALLET_PRIVATE_KEY`    | Wallet private key for blockchain ops | For top-up and x402 payments |

**Authentication options:**

- Use `OPENSERV_USER_API_KEY` for API key authentication
- Use `WALLET_PRIVATE_KEY` for wallet-based (SIWE) authentication

**For Web3 operations:** Just set `WALLET_PRIVATE_KEY` - the client automatically uses it for blockchain transactions and handles SIWE authentication. No need to pass it explicitly in API calls.

## Types

All types are exported for TypeScript users:

```typescript
import type {
  // Domain types
  Agent,
  Workflow,
  WorkflowConfig,
  WorkflowData,
  Task,
  Trigger,
  TaskDefinition,
  EdgeDefinition,
  Edge,
  // Marketplace types
  MarketplaceAgent,
  MarketplaceAgentsResponse,
  Category,
  // Integration types
  IntegrationConnection,
  // Trigger config types
  TriggerConfig,
  WebhookTriggerConfig,
  X402TriggerConfig,
  CronTriggerConfig,
  ManualTriggerConfig,
  InputSchema,
  InputSchemaProperty,
  // API response types
  PaginatedResponse,
  IdResponse,
  ApiKeyResponse,
  NonceResponse,
  VerifyResponse,
  // Web3 types
  UsdcTopupConfig,
  UsdcTopupResult,
  UsdcVerifyRequest,
  UsdcVerifyResponse,
  // x402 Payment types
  X402PaymentRequest,
  X402PaymentResult,
  // ERC-8004 types
  Erc8004DeployRequest,
  RegisterOnChainResult,
  Erc8004ChainConfig,
  Web3Wallet,
  ImportWeb3WalletRequest,
  CallableTrigger,
  PresignIpfsUrlResponse,
  SignFeedbackAuthResponse,
  // Provision types
  ProvisionConfig,
  ProvisionResult,
  Logger
} from '@openserv-labs/client'
```

## License

MIT License - see [LICENSE](LICENSE) for details.
