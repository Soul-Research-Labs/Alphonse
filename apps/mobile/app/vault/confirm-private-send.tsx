/**
 * Vault flow — Confirm Private Send: review & execute (Vault → Vault).
 *
 * Signing approval screen — never auto-signs.
 */

import { useState, useCallback } from 'react';
import { Text, View, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Address, BigIntString, PrivateReceiveId } from '@alphonse/core';
import { parseTokenAmount } from '@alphonse/evm';

import { Button } from '../../src/components/Button';
import { Warning } from '../../src/components/Warning';
import { SectionCard } from '../../src/components/SectionCard';
import { useWallet } from '../../src/context/WalletContext';

export default function ConfirmPrivateSendScreen() {
  const router = useRouter();
  const { recipient, amount, symbol, decimals, tokenAddress } = useLocalSearchParams<{
    recipient: string;
    amount: string;
    symbol: string;
    decimals: string;
    tokenAddress: string;
  }>();

  const { privacyAdapter, refreshVaultBalances } = useWallet();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const dec = parseInt(decimals ?? '18', 10);
  const isToken = tokenAddress !== '';

  const handleConfirm = useCallback(async () => {
    if (!privacyAdapter || !recipient) return;

    setError('');
    setProcessing(true);

    try {
      const rawAmount = parseTokenAmount(amount ?? '0', dec) as unknown as BigIntString;

      const result = await privacyAdapter.privateSend({
        to: recipient as PrivateReceiveId,
        assetContract: isToken ? (tokenAddress as Address) : null,
        amount: rawAmount,
      });

      if (!result.ok) {
        setError(result.error.message);
        setProcessing(false);
        return;
      }

      await refreshVaultBalances();

      router.push({
        pathname: '/vault/result',
        params: {
          operation: 'private-send',
          amount: amount ?? '0',
          symbol: symbol ?? 'ETH',
          txHash: result.value.proofId,
        },
      });
    } catch {
      setError('Private send failed. Check network and try again.');
    } finally {
      setProcessing(false);
    }
  }, [
    privacyAdapter,
    recipient,
    amount,
    dec,
    isToken,
    tokenAddress,
    symbol,
    refreshVaultBalances,
    router,
  ]);

  const shortRecipient = recipient ? `${recipient.slice(0, 10)}...${recipient.slice(-6)}` : '';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <ScrollView className="flex-1 px-6 pt-8">
        <Text className="text-2xl font-bold text-brand-900">Confirm Private Send</Text>
        <Text className="mt-2 text-sm text-brand-700">Vault → Vault (Private)</Text>

        <SectionCard title="Details" subtitle="Review before confirming">
          <View className="mt-2 gap-2">
            <View className="flex-row justify-between">
              <Text className="text-sm text-brand-700">Amount</Text>
              <Text className="text-sm font-semibold text-brand-900">
                {amount} {symbol}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm text-brand-700">To</Text>
              <Text className="text-sm text-brand-900">{shortRecipient}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm text-brand-700">Type</Text>
              <Text className="text-sm text-brand-900">Private (V → V)</Text>
            </View>
          </View>
        </SectionCard>

        {!privacyAdapter && (
          <Warning message="Privacy adapter is not available. Private send is disabled." />
        )}

        {error ? <Warning message={error} severity="danger" /> : null}

        <View className="mt-8 gap-3">
          <Button
            onPress={handleConfirm}
            loading={processing}
            disabled={!privacyAdapter || processing}>
            Confirm &amp; Send Privately
          </Button>
          <Button variant="secondary" onPress={() => router.back()}>
            Cancel
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
