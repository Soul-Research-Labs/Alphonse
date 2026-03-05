# @alphonse/evm

viem-based EVM client, transaction building, fee estimation, ERC-20 utilities, and transaction history tracking.

Platform-agnostic — no browser or mobile APIs.

## Installation

```bash
bun add @alphonse/evm
```

## Modules

### EVM Client (`client.ts`)

Create an EVM client connected to a network with RPC endpoint rotation.

```ts
import { createEvmClient, DEFAULT_NETWORK, DEFAULT_RPC_ENDPOINTS } from '@alphonse/evm';

const client = createEvmClient({
  network: DEFAULT_NETWORK, // Sepolia by default
  rpcEndpoints: DEFAULT_RPC_ENDPOINTS[11155111],
});

// Get balances (native + ERC-20)
const result = await client.getAllBalances(address, tokens);
// { native: bigint, nativeFormatted: string, tokens: TokenBalance[] }

// Get chain ID
const chainId = client.getChainId();

// Get transaction receipt
const receipt = await client.getTransactionReceipt(txHash);

// Send raw signed transaction
const hash = await client.sendRawTransaction(signedTx);

// Estimate gas
const gas = await client.estimateGas(txRequest);
```

### Networks (`networks.ts`)

Predefined network configurations and token registries.

```ts
import { DEFAULT_NETWORK, NETWORKS, KNOWN_TOKENS, DEFAULT_RPC_ENDPOINTS } from '@alphonse/evm';

// Default: Sepolia testnet
DEFAULT_NETWORK.name; // 'Sepolia'
DEFAULT_NETWORK.chainId; // 11155111

// Known tokens per chain (ETH + up to 2 ERC-20s)
const tokens = KNOWN_TOKENS[11155111];
// [{ symbol: 'USDC', address: '0x...', decimals: 6 }, ...]
```

### RPC Endpoint Rotation (`rpc.ts`)

Automatic endpoint health tracking and rotation.

```ts
import { createRpcManager } from '@alphonse/evm';

const rpc = createRpcManager(endpoints);

// Get a healthy endpoint (rotates on failure)
const endpoint = rpc.getHealthy();

// Mark an endpoint as failed
rpc.markFailed(endpoint.url);

// Mark as recovered
rpc.markHealthy(endpoint.url);

// User-provided endpoints are prioritized
```

**Behavior:**

- Tracks `failureCount` and `lastCheckedAt` per endpoint
- User-provided endpoints always tried first
- Failed endpoints are skipped until marked healthy
- Handles rate-limits and timeouts gracefully

### Fee Estimation (`fee.ts`)

EIP-1559 fee estimation with three speed tiers.

```ts
import { estimateFees } from '@alphonse/evm';

const fees = await estimateFees(client);
// {
//   slow:     { maxFeePerGas, maxPriorityFeePerGas, estimatedSeconds },
//   standard: { maxFeePerGas, maxPriorityFeePerGas, estimatedSeconds },
//   fast:     { maxFeePerGas, maxPriorityFeePerGas, estimatedSeconds },
// }
```

| Speed      | Priority Fee Multiplier | Estimated Time |
| ---------- | ----------------------- | -------------- |
| `SLOW`     | 1x                      | ~30s           |
| `STANDARD` | 1.5x                    | ~15s           |
| `FAST`     | 2x                      | ~6s            |

### Transaction Builder (`tx.ts`)

Build unsigned EIP-1559 transactions.

```ts
import { buildTransaction } from '@alphonse/evm';

const tx = buildTransaction({
  from: senderAddress,
  to: recipientAddress,
  value: '1000000000000000000', // 1 ETH in wei
  chainId: 11155111,
  feeEstimate: fees.standard,
  nonce: 42,
  gasLimit: 21000n,
});
// Returns: unsigned EIP-1559 transaction object
```

### ERC-20 Utilities (`erc20.ts`)

Token amount formatting and ABI encoding.

```ts
import { formatTokenAmount, parseTokenAmount, encodeERC20Transfer } from '@alphonse/evm';

// Format raw amount → human-readable
formatTokenAmount(1000000n, 6); // '1.0'
formatTokenAmount(1500000000000000000n, 18); // '1.5'

// Parse human-readable → raw amount
parseTokenAmount('1.5', 18); // 1500000000000000000n

// Encode ERC-20 function calls
const data = encodeERC20Transfer(recipientAddress, amount);
const balanceData = encodeERC20BalanceOf(ownerAddress);
const approveData = encodeERC20Approve(spenderAddress, amount);
```

### Transaction History Tracker (`history.ts`)

Local in-memory transaction history with status tracking.

```ts
import { createTransactionTracker } from '@alphonse/evm';

const tracker = createTransactionTracker();

// Add a transaction
tracker.add({
  hash: '0x...',
  direction: 'OUTGOING',
  status: 'PENDING',
  pool: 'PUBLIC',
  from: senderAddress,
  to: recipientAddress,
  amount: '1.5',
  assetSymbol: 'ETH',
  fee: '0.001',
  timestamp: Date.now(),
});

// Get all entries (newest first)
const all = tracker.getAll();

// Filter by status or pool
const pending = tracker.getByStatus('PENDING');
const publicTxs = tracker.getByPool('PUBLIC');

// Refresh pending transaction statuses from the network
await tracker.refreshPending(evmClient);

// Pending count
tracker.pendingCount();

// Export/import for persistence
const data = tracker.exportData();
tracker.importData(data);

// Clear all history
tracker.clear();
```

**`TransactionHistoryEntry` fields:**

| Field         | Type                                   | Description                             |
| ------------- | -------------------------------------- | --------------------------------------- |
| `hash`        | `TxHash`                               | Transaction hash                        |
| `direction`   | `'INCOMING' \| 'OUTGOING'`             | Transaction direction                   |
| `status`      | `'PENDING' \| 'CONFIRMED' \| 'FAILED'` | Current status                          |
| `pool`        | `'PUBLIC' \| 'VAULT'`                  | Which pool the tx belongs to            |
| `from`        | `Address`                              | Sender address                          |
| `to`          | `Address`                              | Recipient address                       |
| `amount`      | `string`                               | Human-readable amount                   |
| `assetSymbol` | `string`                               | Asset symbol (e.g., `'ETH'`, `'USDC'`)  |
| `fee`         | `string`                               | Fee in native currency (human-readable) |
| `timestamp`   | `Timestamp`                            | Unix timestamp (ms)                     |
| `noteId?`     | `NoteId`                               | Attached metadata note ID               |
| `labelIds?`   | `LabelId[]`                            | Attached metadata label IDs             |

## Types

```ts
import type {
  // Network
  NetworkConfig,
  ChainId,
  RpcEndpoint,
  RpcEndpointStatus,
  RpcConfig,

  // Client
  EvmClientConfig,
  EvmClient,
  BlockTag,

  // Transaction
  TransactionRequest,
  TransactionStatus,
  TransactionReceipt,
  TransactionDirection,
  TransactionHistoryEntry,
  TransactionTracker,

  // Fee
  FeeSpeed,
  FeeEstimate,
  FeeEstimates,

  // Token
  TokenInfo,
  TokenBalance,
  TokenAllowance,
} from '@alphonse/evm';
```

## Testing

```bash
cd packages/evm
npx vitest run        # Run all 31 tests
npx vitest --watch    # Watch mode
```

| Test Suite          | Tests | Coverage                                              |
| ------------------- | ----- | ----------------------------------------------------- |
| ERC-20 utilities    | 15    | `formatTokenAmount`, `parseTokenAmount`, ABI encoding |
| Transaction builder | 3     | EIP-1559 tx construction                              |
| Tx history tracker  | 7     | Add, deduplicate, filter, export/import               |
| Network configs     | 6     | Default network, known tokens, RPC endpoints          |

## Dependencies

| Package          | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `@alphonse/core` | Shared types (`Address`, `TxHash`, `Result`, etc.)                 |
| `viem`           | EVM JSON-RPC client, ABI encoding, type-safe Ethereum interactions |
