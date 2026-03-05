/**
 * Vault flow — Confirm Withdraw: review & execute unshield (Vault → Public).
 *
 * This transfer is public — the warning is mandatory per AGENTS.md.
 * Signing approval screen — never auto-signs.
 */

import { useState, useCallback } from 'react';
import { Text, View, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Address, BigIntString } from '@alphonse/core';
import { parseTokenAmount } from '@alphonse/evm';

import { Button } from '../../src/components/Button';
import { Warning } from '../../src/components/Warning';
import { SectionCard } from '../../src/components/SectionCard';
import { useWallet } from '../../src/context/WalletContext';

export default function ConfirmWithdrawScreen() {
  const router = useRouter();
  const { amount, symbol, decimals, tokenAddress } = useLocalSearchParams<{
    amount: string;
    symbol: string;
    decimals: string;
    tokenAddress: string;
  }>();

  const { state, privacyAdapter, refreshBalances, refreshVaultBalances } = useWallet();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const dec = parseInt(decimals ?? '18', 10);
  const isToken = tokenAddress !== '';

  const handleConfirm = useCallback(async () => {
    if (!privacyAdapter || !state.address) return;

    setError('');
    setProcessing(true);

    try {
      const rawAmount = parseTokenAmount(amount ?? '0', dec) as unknown as BigIntString;

      const result = await privacyAdapter.unshield({
        to: state.address,
        assetContract: isToken ? (tokenAddress as Address) : null,
        amount: rawAmount,
      });

      if (!result.ok) {
        setError(result.error.message);
        setProcessing(false);
        return;
      }

      await Promise.all([refreshBalances(), refreshVaultBalances()]);

      router.push({
        pathname: '/vault/result',
        params: {
          operation: 'withdraw',
          amount: amount ?? '0',
          symbol: symbol ?? 'ETH',
          txHash: result.value.txHashes[0] ?? '',
        },
      });
    } catch {
      setError('Withdraw failed. Check network and try again.');
    } finally {
      setProcessing(false);
    }
  }, [
    privacyAdapter,
    state.address,
    amount,
    dec,
    isToken,
    tokenAddress,
    symbol,
    refreshBalances,
    refreshVaultBalances,
    router,
  ]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <ScrollView className="flex-1 px-6 pt-8">
        <Text className="text-2xl font-bold text-brand-900">Confirm Withdraw</Text>
        <Text className="mt-2 text-sm text-brand-700">Vault → Public (Checking)</Text>

        <Warning
          message="This transfer is public. Your withdrawal will be visible on-chain."
          severity="danger"
        />

        <SectionCard title="Details" subtitle="Review before confirming">
          <View className="mt-2 gap-2">
            <View className="flex-row justify-between">
              <Text className="text-sm text-brand-700">Amount</Text>
              <Text className="text-sm font-semibold text-brand-900">
                {amount} {symbol}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm text-brand-700">From</Text>
              <Text className="text-sm text-brand-900">Vault (Private)</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm text-brand-700">To</Text>
              <Text className="text-sm text-brand-900">
                {state.address
                  ? `${(state.address as string).slice(0, 8)}...${(state.address as string).slice(-4)}`
                  : 'Public'}
              </Text>
            </View>
          </View>
        </SectionCard>

        {!privacyAdapter && (
          <Warning message="Privacy adapter is not available. Withdraw is disabled." />
        )}

        {error ? <Warning message={error} severity="danger" /> : null}

        <View className="mt-8 gap-3">
          <Button
            onPress={handleConfirm}
            loading={processing}
            disabled={!privacyAdapter || processing}>
            Confirm &amp; Withdraw
          </Button>
          <Button variant="secondary" onPress={() => router.back()}>
            Cancel
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
