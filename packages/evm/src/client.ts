/**
 * EVM client — main entry point for chain interactions.
 *
 * Wraps viem's PublicClient with our type system and RPC rotation.
 * Platform-agnostic; no browser or mobile APIs.
 */

import { createPublicClient, type PublicClient, type Chain, formatEther } from 'viem';
import { Result } from '@alphonse/core';
import type { Address, AsyncResult, Hex, TxHash, BigIntString, Timestamp } from '@alphonse/core';
import type { EvmClientConfig, BlockTag } from './types/client';
import type { NetworkConfig, RpcConfig, RpcEndpoint } from './types/network';
import type { TransactionReceipt, TransactionStatus } from './types/transaction';
import type { TokenBalance, TokenInfo } from './types/token';
import { createRpcTransport, DEFAULT_RPC_CONFIG } from './rpc';
import { ERC20_ABI, formatTokenAmount } from './erc20';
import { DEFAULT_NETWORK, DEFAULT_RPC_ENDPOINTS } from './networks';

// ---------------------------------------------------------------------------
// EvmClient interface
// ---------------------------------------------------------------------------

export interface EvmClient {
  /** Get native (ETH) balance in wei. */
  getBalance: (address: Address) => AsyncResult<bigint>;
  /** Get native balance formatted as human-readable string. */
  getBalanceFormatted: (address: Address) => AsyncResult<string>;
  /** Get ERC-20 token balance. */
  getTokenBalance: (address: Address, token: TokenInfo) => AsyncResult<TokenBalance>;
  /** Get all balances (native + configured tokens). */
  getAllBalances: (
    address: Address,
    tokens: readonly TokenInfo[]
  ) => AsyncResult<{ native: bigint; nativeFormatted: string; tokens: TokenBalance[] }>;
  /** Get transaction count (nonce). */
  getNonce: (address: Address) => AsyncResult<number>;
  /** Get latest block info. */
  getBlock: (tag?: BlockTag) => AsyncResult<{ baseFee: bigint; number: bigint; timestamp: bigint }>;
  /** Estimate gas for a call. */
  estimateGas: (params: {
    from: Address;
    to: Address;
    value?: bigint;
    data?: Hex;
  }) => AsyncResult<bigint>;
  /** Send a signed raw transaction. */
  sendRawTransaction: (signedTx: Hex) => AsyncResult<TxHash>;
  /** Get receipt for a transaction (null if not yet mined). */
  getTransactionReceipt: (hash: TxHash) => AsyncResult<TransactionReceipt | null>;
  /** Wait for a transaction to be mined. */
  waitForReceipt: (
    hash: TxHash,
    confirmations?: number,
    timeoutMs?: number
  ) => AsyncResult<TransactionReceipt>;
  /** Read contract (generic eth_call). */
  readContract: (params: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => AsyncResult<unknown>;
  /** Get the chain ID this client is configured for. */
  getChainId: () => number;
  /** Get the network config. */
  getNetwork: () => NetworkConfig;
  /** Get the underlying viem client (escape hatch). */
  getViemClient: () => PublicClient;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateEvmClientOptions {
  network?: NetworkConfig;
  rpcEndpoints?: readonly RpcEndpoint[];
  rpcConfig?: Partial<typeof DEFAULT_RPC_CONFIG>;
}

export function createEvmClient(options: CreateEvmClientOptions = {}): EvmClient {
  const network = options.network ?? DEFAULT_NETWORK;
  const endpoints = options.rpcEndpoints ?? DEFAULT_RPC_ENDPOINTS[network.chainId] ?? [];

  if (endpoints.length === 0) {
    throw new Error(`No RPC endpoints configured for chain ${network.chainId}`);
  }

  const rpcConfig: RpcConfig = {
    endpoints: endpoints as readonly [RpcEndpoint, ...RpcEndpoint[]],
    requestTimeoutMs: options.rpcConfig?.requestTimeoutMs ?? DEFAULT_RPC_CONFIG.requestTimeoutMs,
    maxRetries: options.rpcConfig?.maxRetries ?? DEFAULT_RPC_CONFIG.maxRetries,
    retryBackoffMs: options.rpcConfig?.retryBackoffMs ?? DEFAULT_RPC_CONFIG.retryBackoffMs,
  };

  const transport = createRpcTransport(rpcConfig);

  // Build a minimal viem Chain definition from our NetworkConfig
  const viemChain: Chain = {
    id: network.chainId as number,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: {
      default: { http: endpoints.map((e) => e.url) },
    },
    blockExplorers: network.explorerUrl
      ? { default: { name: 'Explorer', url: network.explorerUrl } }
      : undefined,
  };

  const publicClient = createPublicClient({ chain: viemChain, transport });

  // ---------------------------------------------------------------------------
  // Implementation
  // ---------------------------------------------------------------------------

  async function getBalance(address: Address): AsyncResult<bigint> {
    try {
      const balance = await publicClient.getBalance({ address: address as `0x${string}` });
      return Result.ok(balance);
    } catch (cause) {
      return Result.err({
        code: 'RPC_ERROR' as const,
        message: `Failed to get balance for ${address}`,
        cause,
      });
    }
  }

  async function getBalanceFormatted(address: Address): AsyncResult<string> {
    const result = await getBalance(address);
    if (!result.ok) return result;
    return Result.ok(formatEther(result.value));
  }

  async function getTokenBalance(address: Address, token: TokenInfo): AsyncResult<TokenBalance> {
    try {
      const balance = (await publicClient.readContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      })) as bigint;

      return Result.ok({
        token,
        balance: balance.toString() as BigIntString,
        formatted: formatTokenAmount(balance, token.decimals),
        updatedAt: Date.now() as Timestamp,
      });
    } catch (cause) {
      return Result.err({
        code: 'RPC_ERROR' as const,
        message: `Failed to get token balance: ${token.symbol}`,
        cause,
      });
    }
  }

  async function getAllBalances(
    address: Address,
    tokens: readonly TokenInfo[]
  ): AsyncResult<{ native: bigint; nativeFormatted: string; tokens: TokenBalance[] }> {
    try {
      const [nativeResult, ...tokenResults] = await Promise.all([
        getBalance(address),
        ...tokens.map((t) => getTokenBalance(address, t)),
      ]);

      if (!nativeResult.ok) return nativeResult;

      const tokenBalances: TokenBalance[] = [];
      for (const r of tokenResults) {
        if (r.ok) tokenBalances.push(r.value);
        // Skip failed tokens silently — partial results are better than none
      }

      return Result.ok({
        native: nativeResult.value,
        nativeFormatted: formatEther(nativeResult.value),
        tokens: tokenBalances,
      });
    } catch (cause) {
      return Result.err({
        code: 'RPC_ERROR' as const,
        message: 'Failed to fetch balances',
        cause,
      });
    }
  }

  async function getNonce(address: Address): AsyncResult<number> {
    try {
      const count = await publicClient.getTransactionCount({ address: address as `0x${string}` });
      return Result.ok(count);
    } catch (cause) {
      return Result.err({
        code: 'RPC_ERROR' as const,
        message: `Failed to get nonce for ${address}`,
        cause,
      });
    }
  }

  async function getBlock(
    tag: BlockTag = 'latest'
  ): AsyncResult<{ baseFee: bigint; number: bigint; timestamp: bigint }> {
    try {
      const block = await publicClient.getBlock({ blockTag: tag });
      return Result.ok({
        baseFee: block.baseFeePerGas ?? 0n,
        number: block.number ?? 0n,
        timestamp: block.timestamp,
      });
    } catch (cause) {
      return Result.err({
        code: 'RPC_ERROR' as const,
        message: 'Failed to get block',
        cause,
      });
    }
  }

  async function estimateGas(params: {
    from: Address;
    to: Address;
    value?: bigint;
    data?: Hex;
  }): AsyncResult<bigint> {
    try {
      const gas = await publicClient.estimateGas({
        account: params.from as `0x${string}`,
        to: params.to as `0x${string}`,
        value: params.value,
        data: params.data as `0x${string}` | undefined,
      });
      return Result.ok(gas);
    } catch (cause) {
      return Result.err({
        code: 'RPC_ERROR' as const,
        message: 'Failed to estimate gas',
        cause,
      });
    }
  }

  async function sendRawTransaction(signedTx: Hex): AsyncResult<TxHash> {
    try {
      const hash = await publicClient.sendRawTransaction({
        serializedTransaction: signedTx as `0x${string}`,
      });
      return Result.ok(hash as TxHash);
    } catch (cause) {
      return Result.err({
        code: 'TX_FAILED' as const,
        message: 'Failed to send transaction',
        cause,
      });
    }
  }

  async function getTransactionReceipt(hash: TxHash): AsyncResult<TransactionReceipt | null> {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: hash as `0x${string}` });
      if (!receipt) return Result.ok(null);

      return Result.ok({
        hash,
        status: (receipt.status === 'success' ? 'CONFIRMED' : 'FAILED') as TransactionStatus,
        from: receipt.from as Address,
        to: (receipt.to ?? null) as Address | null,
        value: '0' as BigIntString, // Receipt doesn't include value; caller tracks it
        gasUsed: receipt.gasUsed.toString() as BigIntString,
        effectiveGasPrice: receipt.effectiveGasPrice.toString() as BigIntString,
        blockNumber: receipt.blockNumber,
        timestamp: Date.now() as Timestamp,
      });
    } catch (cause) {
      // Transaction not yet mined
      if (String(cause).includes('could not be found')) return Result.ok(null);
      return Result.err({
        code: 'RPC_ERROR' as const,
        message: `Failed to get receipt for ${hash}`,
        cause,
      });
    }
  }

  async function waitForReceipt(
    hash: TxHash,
    confirmations = 1,
    timeoutMs = 120_000
  ): AsyncResult<TransactionReceipt> {
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
        confirmations,
        timeout: timeoutMs,
      });

      return Result.ok({
        hash,
        status: (receipt.status === 'success' ? 'CONFIRMED' : 'FAILED') as TransactionStatus,
        from: receipt.from as Address,
        to: (receipt.to ?? null) as Address | null,
        value: '0' as BigIntString,
        gasUsed: receipt.gasUsed.toString() as BigIntString,
        effectiveGasPrice: receipt.effectiveGasPrice.toString() as BigIntString,
        blockNumber: receipt.blockNumber,
        timestamp: Date.now() as Timestamp,
      });
    } catch (cause) {
      return Result.err({
        code: 'TIMEOUT' as const,
        message: `Timed out waiting for receipt: ${hash}`,
        cause,
      });
    }
  }

  async function readContract(params: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): AsyncResult<unknown> {
    try {
      const result = await publicClient.readContract({
        address: params.address as `0x${string}`,
        abi: params.abi as any,
        functionName: params.functionName,
        args: params.args as any,
      });
      return Result.ok(result);
    } catch (cause) {
      return Result.err({
        code: 'RPC_ERROR' as const,
        message: `Contract read failed: ${params.functionName}`,
        cause,
      });
    }
  }

  return {
    getBalance,
    getBalanceFormatted,
    getTokenBalance,
    getAllBalances,
    getNonce,
    getBlock,
    estimateGas,
    sendRawTransaction,
    getTransactionReceipt,
    waitForReceipt,
    readContract,
    getChainId: () => network.chainId as number,
    getNetwork: () => network,
    getViemClient: () => publicClient as PublicClient,
  };
}
