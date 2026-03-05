/**
 * Send flow — Step 4: Transaction result.
 *
 * Shows the transaction hash, a link to the block explorer,
 * and polls for receipt status.
 */

import { useState, useEffect, useRef } from 'react';
import { Text, View, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import type { TxHash } from '@alphonse/core';
import { DEFAULT_NETWORK } from '@alphonse/evm';

import { Button } from '../../src/components/Button';
import { useWallet } from '../../src/context/WalletContext';

type TxStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

export default function SendResultScreen() {
  const router = useRouter();
  const { txHash } = useLocalSearchParams<{ txHash: string }>();
  const { evmClient, txTracker } = useWallet();

  const [status, setStatus] = useState<TxStatus>('PENDING');
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for receipt
  useEffect(() => {
    if (!txHash) return;

    async function checkReceipt() {
      const result = await evmClient.getTransactionReceipt(txHash as TxHash);
      if (result.ok && result.value !== null) {
        const newStatus = result.value.status;
        setStatus(newStatus);
        txTracker.updateStatus(txHash as TxHash, newStatus);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }

    checkReceipt();
    pollRef.current = setInterval(checkReceipt, 5_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [txHash, evmClient, txTracker]);

  const explorerUrl = `${DEFAULT_NETWORK.explorerUrl}/tx/${txHash}`;

  async function handleCopy() {
    if (txHash) {
      await Clipboard.setStringAsync(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const statusIcon: Record<TxStatus, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
    PENDING: { name: 'time-outline', color: '#d97706' },
    CONFIRMED: { name: 'checkmark-circle-outline', color: '#16a34a' },
    FAILED: { name: 'close-circle-outline', color: '#dc2626' },
  };

  const { name: iconName, color: iconColor } = statusIcon[status];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <View className="flex-1 items-center justify-center px-6">
        <Ionicons name={iconName} size={64} color={iconColor} />

        <Text className="mt-4 text-2xl font-bold text-brand-900">
          {status === 'PENDING'
            ? 'Transaction Sent'
            : status === 'CONFIRMED'
              ? 'Transaction Confirmed!'
              : 'Transaction Failed'}
        </Text>

        <Text className="mt-2 text-center text-sm text-brand-700">
          {status === 'PENDING'
            ? 'Your transaction has been broadcast to the network and is awaiting confirmation.'
            : status === 'CONFIRMED'
              ? 'Your transaction has been confirmed on the blockchain.'
              : 'The transaction was reverted. Your funds are safe.'}
        </Text>

        {/* Transaction hash */}
        <Pressable
          onPress={handleCopy}
          className="mt-6 flex-row items-center rounded-xl border border-brand-200 bg-white px-4 py-3">
          <Text className="flex-1 text-xs text-brand-700" numberOfLines={1}>
            {txHash}
          </Text>
          <Ionicons
            name={copied ? 'checkmark-outline' : 'copy-outline'}
            size={18}
            color="#232b83"
            style={{ marginLeft: 8 }}
          />
        </Pressable>
        {copied ? <Text className="mt-1 text-xs text-brand-500">Copied to clipboard</Text> : null}

        {/* Explorer link */}
        <Text className="mt-4 text-xs text-brand-500">View on Etherscan: {explorerUrl}</Text>

        <View className="mt-8 w-full gap-3">
          <Button
            onPress={() => {
              // Navigate back to the checking tab, clearing the send stack
              router.dismissAll();
              router.replace('/(tabs)');
            }}>
            Done
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
