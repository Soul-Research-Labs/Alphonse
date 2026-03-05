import { Text, View, RefreshControl, ScrollView, Pressable } from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';

import type { TransactionHistoryEntry } from '@alphonse/evm';

import { SectionCard } from '../../src/components/SectionCard';
import { useWallet } from '../../src/context/WalletContext';

const STATUS_ICONS: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  PENDING: { name: 'time-outline', color: '#d97706' },
  CONFIRMED: { name: 'checkmark-circle-outline', color: '#16a34a' },
  FAILED: { name: 'close-circle-outline', color: '#dc2626' },
};

function TxRow({ entry }: { entry: TransactionHistoryEntry }) {
  const icon = STATUS_ICONS[entry.status] ?? STATUS_ICONS.PENDING;
  const isOutgoing = entry.direction === 'OUTGOING';
  const address = isOutgoing ? entry.to : entry.from;
  const truncated = `${(address as string).slice(0, 6)}...${(address as string).slice(-4)}`;
  const date = new Date(entry.timestamp as number);

  return (
    <View className="flex-row items-center justify-between border-b border-brand-100 py-3">
      <View className="flex-row items-center gap-3">
        <Ionicons name={icon.name} size={22} color={icon.color} />
        <View>
          <Text className="text-sm font-medium text-brand-900">
            {isOutgoing ? 'Sent' : 'Received'} {entry.assetSymbol}
          </Text>
          <Text className="text-xs text-brand-500">
            {truncated} · {date.toLocaleDateString()}
          </Text>
        </View>
      </View>
      <View className="items-end">
        <Text className="text-sm font-semibold text-brand-900">
          {isOutgoing ? '-' : '+'}
          {entry.amount}
        </Text>
        <View className="mt-0.5 rounded-md bg-brand-100 px-1.5 py-0.5">
          <Text className="text-[10px] font-semibold text-brand-700">{entry.pool}</Text>
        </View>
      </View>
    </View>
  );
}

export default function ActivityScreen() {
  const { txTracker, evmClient } = useWallet();
  const [refreshing, setRefreshing] = useState(false);

  // Force re-render when entries change
  const [, setTick] = useState(0);

  const entries = txTracker.getAll();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await txTracker.refreshPending(evmClient);
    setTick((t) => t + 1);
    setRefreshing(false);
  }, [txTracker, evmClient]);

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ gap: 12 }}>
      <SectionCard title="Unified Activity" subtitle="Public and private feed with pool badges">
        {entries.length === 0 ? (
          <View className="py-4">
            <Text className="text-center text-sm text-brand-500">
              No transactions yet. Send or receive funds to see activity here.
            </Text>
          </View>
        ) : (
          <View>
            {entries.map((entry) => (
              <TxRow key={entry.hash as string} entry={entry} />
            ))}
          </View>
        )}
      </SectionCard>

      {txTracker.pendingCount() > 0 ? (
        <View className="rounded-xl border border-brand-200 bg-white px-4 py-3">
          <Text className="text-xs text-brand-700">
            {txTracker.pendingCount()} pending transaction(s). Pull to refresh.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
