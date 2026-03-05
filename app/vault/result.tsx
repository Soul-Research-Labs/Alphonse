/**
 * Vault flow — Result: operation completed.
 *
 * Shows the result of a shield, withdraw, or private send operation.
 */

import { useState } from 'react';
import { Text, View, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { Button } from '../../src/components/Button';

const OPERATION_LABELS: Record<string, { title: string; icon: keyof typeof Ionicons.glyphMap }> = {
  shield: { title: 'Shielded', icon: 'lock-closed-outline' },
  withdraw: { title: 'Withdrawn', icon: 'lock-open-outline' },
  'private-send': { title: 'Sent Privately', icon: 'eye-off-outline' },
};

export default function VaultResultScreen() {
  const router = useRouter();
  const { operation, amount, symbol, txHash } = useLocalSearchParams<{
    operation: string;
    amount: string;
    symbol: string;
    txHash: string;
  }>();

  const [copied, setCopied] = useState(false);

  const label = OPERATION_LABELS[operation ?? 'shield'] ?? OPERATION_LABELS.shield;

  async function handleCopy() {
    if (txHash) {
      await Clipboard.setStringAsync(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <View className="flex-1 items-center justify-center px-6">
        <Ionicons name={label.icon} size={64} color="#16a34a" />

        <Text className="mt-4 text-2xl font-bold text-brand-900">{label.title}</Text>
        <Text className="mt-2 text-lg text-brand-800">
          {amount} {symbol}
        </Text>

        {txHash ? (
          <View className="mt-6 w-full rounded-2xl border border-brand-200 bg-white p-4">
            <Text className="text-xs text-brand-500">
              {operation === 'private-send' ? 'Proof ID' : 'Transaction Hash'}
            </Text>
            <Text className="mt-1 text-xs text-brand-900" numberOfLines={1}>
              {txHash}
            </Text>
            <Pressable onPress={handleCopy} className="mt-2">
              <Text className="text-sm font-semibold text-brand-500">
                {copied ? 'Copied!' : 'Copy'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View className="mt-8 w-full">
          <Button onPress={() => router.dismissAll()}>Done</Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
