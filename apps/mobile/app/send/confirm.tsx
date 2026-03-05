/**
 * Send flow — Step 3: Review & Confirm.
 *
 * This is the **signing approval screen** (AGENTS.md requirement):
 * - Shows full transaction details before signing
 * - Fee speed selector (slow/standard/fast)
 * - Fee estimation via EIP-1559
 * - "Confirm & Sign" button → local signing → broadcast
 * - Never auto-signs
 */

import { useState, useEffect, useCallback } from 'react';
import { Text, View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Address } from '@alphonse/core';
import {
  estimateFees,
  sendTransaction,
  createSigner,
  parseTokenAmount,
  createEthTransferEntry,
  createTokenTransferEntry,
} from '@alphonse/evm';
import type { FeeEstimates, FeeSpeed, FeeEstimate } from '@alphonse/evm';

import { Button } from '../../src/components/Button';
import { Warning } from '../../src/components/Warning';
import { useWallet } from '../../src/context/WalletContext';

type SpeedKey = 'slow' | 'standard' | 'fast';

const SPEED_LABELS: Record<SpeedKey, string> = {
  slow: 'Slow',
  standard: 'Standard',
  fast: 'Fast',
};

const SPEED_DESCRIPTIONS: Record<SpeedKey, string> = {
  slow: '~5 min',
  standard: '~30 sec',
  fast: '~15 sec',
};

export default function SendConfirmScreen() {
  const router = useRouter();
  const { to, amount, symbol, decimals, tokenAddress } = useLocalSearchParams<{
    to: string;
    amount: string;
    symbol: string;
    decimals: string;
    tokenAddress: string;
  }>();

  const { state, evmClient, txTracker, getSigningKeyPair, refreshBalances } = useWallet();

  const [fees, setFees] = useState<FeeEstimates | null>(null);
  const [selectedSpeed, setSelectedSpeed] = useState<SpeedKey>('standard');
  const [loadingFees, setLoadingFees] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const isToken = tokenAddress !== '';
  const dec = parseInt(decimals ?? '18', 10);

  // Estimate fees on mount
  useEffect(() => {
    (async () => {
      setLoadingFees(true);
      try {
        const valueWei = isToken ? 0n : parseTokenAmount(amount ?? '0', 18);
        const result = await estimateFees(evmClient, {
          from: state.address ?? undefined,
          to: (isToken ? tokenAddress : to) as Address,
          value: valueWei > 0n ? valueWei : undefined,
        });
        if (result.ok) {
          setFees(result.value);
        } else {
          setError('Failed to estimate fees. Try again.');
        }
      } catch {
        setError('Fee estimation failed. Check network.');
      } finally {
        setLoadingFees(false);
      }
    })();
  }, []);

  const selectedFee: FeeEstimate | null = fees ? fees[selectedSpeed] : null;

  const handleConfirm = useCallback(async () => {
    if (!state.address || !to || !amount) return;

    setError('');
    setSending(true);

    try {
      // Get the signing key pair from the wallet manager
      const keyPair = getSigningKeyPair();
      if (!keyPair) {
        setError('Wallet is locked. Cannot sign.');
        setSending(false);
        return;
      }

      // Create a signer from the private key
      const signer = createSigner(keyPair.privateKey, state.address);

      // Build transaction params
      const txParams: Parameters<typeof sendTransaction>[2] = {
        from: state.address,
        to: to as Address,
        feeSpeed: selectedSpeed.toUpperCase() as FeeSpeed,
      };

      if (isToken && tokenAddress) {
        // ERC-20 transfer
        const rawAmount = parseTokenAmount(amount, dec);
        txParams.token = {
          address: tokenAddress as Address,
          amount: rawAmount,
        };
      } else {
        // Native ETH transfer
        txParams.value = parseTokenAmount(amount, 18);
      }

      // If we have pre-estimated fees, use them
      if (selectedFee) {
        txParams.maxFeePerGas = BigInt(selectedFee.maxFeePerGas);
        txParams.maxPriorityFeePerGas = BigInt(selectedFee.maxPriorityFeePerGas);
        txParams.gasLimit = BigInt(selectedFee.gasLimit);
      }

      // Send transaction (build → sign → broadcast)
      const result = await sendTransaction(evmClient, signer, txParams);

      if (!result.ok) {
        setError(result.error.message);
        setSending(false);
        return;
      }

      // Track the transaction locally
      const txHash = result.value;
      if (isToken) {
        txTracker.track(
          createTokenTransferEntry({
            hash: txHash,
            from: state.address,
            to: to as Address,
            amount: `${amount} ${symbol}`,
            symbol: symbol ?? 'TOKEN',
            fee: selectedFee?.estimatedCostFormatted,
          })
        );
      } else {
        const valueWei = parseTokenAmount(amount, 18);
        txTracker.track(
          createEthTransferEntry({
            hash: txHash,
            from: state.address,
            to: to as Address,
            value: valueWei,
            fee: selectedFee?.estimatedCostFormatted,
          })
        );
      }

      // Navigate to result screen
      router.replace({
        pathname: '/send/result',
        params: { txHash: txHash as string },
      });

      // Refresh balances in background
      refreshBalances();
    } catch (cause) {
      setError('Transaction failed. Please try again.');
    } finally {
      setSending(false);
    }
  }, [
    state.address,
    to,
    amount,
    isToken,
    tokenAddress,
    dec,
    symbol,
    selectedSpeed,
    selectedFee,
    evmClient,
    txTracker,
    getSigningKeyPair,
    refreshBalances,
    router,
  ]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <ScrollView className="flex-1 px-6 pt-8">
        <Text className="text-2xl font-bold text-brand-900">Review Transaction</Text>
        <Text className="mt-2 text-sm text-brand-700">
          Verify the details below before signing.
        </Text>

        {/* Transaction summary */}
        <View className="mt-6 rounded-2xl border border-brand-200 bg-white p-4">
          <Row label="To" value={to ? `${to.slice(0, 10)}...${to.slice(-6)}` : ''} />
          <Row label="Amount" value={`${amount} ${symbol}`} />
          <Row label="Network" value="Sepolia Testnet" />
        </View>

        {/* Fee speed selector */}
        <Text className="mt-6 text-base font-semibold text-brand-900">Transaction Speed</Text>
        {loadingFees ? (
          <View className="mt-3 items-center">
            <ActivityIndicator color="#232b83" />
            <Text className="mt-2 text-sm text-brand-700">Estimating fees...</Text>
          </View>
        ) : fees ? (
          <View className="mt-3 gap-2">
            {(['slow', 'standard', 'fast'] as const).map((speed) => {
              const tier = fees[speed];
              const isSelected = speed === selectedSpeed;
              return (
                <Pressable
                  key={speed}
                  onPress={() => setSelectedSpeed(speed)}
                  className={`flex-row items-center justify-between rounded-xl border p-3 ${
                    isSelected ? 'border-brand-500 bg-brand-100' : 'border-brand-200 bg-white'
                  }`}>
                  <View>
                    <Text
                      className={`text-sm font-semibold ${
                        isSelected ? 'text-brand-900' : 'text-brand-700'
                      }`}>
                      {SPEED_LABELS[speed]}
                    </Text>
                    <Text className="text-xs text-brand-500">{SPEED_DESCRIPTIONS[speed]}</Text>
                  </View>
                  <Text className="text-sm text-brand-800">~{tier.estimatedCostFormatted} ETH</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Total cost */}
        {selectedFee ? (
          <View className="mt-4 rounded-xl border border-brand-200 bg-white p-3">
            <Row label="Estimated Fee" value={`${selectedFee.estimatedCostFormatted} ETH`} />
            {!isToken ? (
              <Row label="Total" value={`${amount} + ${selectedFee.estimatedCostFormatted} ETH`} />
            ) : null}
          </View>
        ) : null}

        {/* Warning */}
        <View className="mt-4">
          <Warning
            severity="info"
            message="This is a public transaction on the Ethereum network. It will be visible on the blockchain."
          />
        </View>

        {error ? (
          <View className="mt-3">
            <Warning severity="danger" message={error} />
          </View>
        ) : null}

        {/* Action buttons */}
        <View className="mt-6 gap-3 pb-8">
          <Button onPress={handleConfirm} disabled={loadingFees || sending} loading={sending}>
            {sending ? 'Signing & Sending...' : 'Confirm & Sign'}
          </Button>
          <Button variant="secondary" onPress={() => router.back()} disabled={sending}>
            Back
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Simple label-value row for summary cards. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="text-sm text-brand-700">{label}</Text>
      <Text className="text-sm font-medium text-brand-900">{value}</Text>
    </View>
  );
}
