/**
 * TxListItem — enriched transaction row with pool badge, labels, and note.
 */

import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { TransactionHistoryEntry } from '@alphonse/evm';

const STATUS_ICONS: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  PENDING: { name: 'time-outline', color: '#d97706' },
  CONFIRMED: { name: 'checkmark-circle-outline', color: '#16a34a' },
  FAILED: { name: 'close-circle-outline', color: '#dc2626' },
};

const POOL_COLORS: Record<string, { bg: string; text: string }> = {
  PUBLIC: { bg: 'bg-blue-100', text: 'text-blue-700' },
  VAULT: { bg: 'bg-purple-100', text: 'text-purple-700' },
};

interface TxListItemProps {
  entry: TransactionHistoryEntry;
  /** Resolved label names (if any). */
  labels?: string[];
  /** Resolved note content (if any). */
  noteContent?: string;
  /** Resolved contact name for counterparty (if any). */
  contactName?: string;
}

export function TxListItem({ entry, labels, noteContent, contactName }: TxListItemProps) {
  const icon = STATUS_ICONS[entry.status] ?? STATUS_ICONS.PENDING;
  const isOutgoing = entry.direction === 'OUTGOING';
  const address = isOutgoing ? entry.to : entry.from;
  const truncated = `${(address as string).slice(0, 6)}...${(address as string).slice(-4)}`;
  const date = new Date(entry.timestamp as number);
  const poolStyle = POOL_COLORS[entry.pool] ?? POOL_COLORS.PUBLIC;

  return (
    <View className="border-b border-brand-100 py-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1">
          <Ionicons name={icon.name} size={22} color={icon.color} />
          <View className="flex-1">
            <Text className="text-sm font-medium text-brand-900">
              {isOutgoing ? 'Sent' : 'Received'} {entry.assetSymbol}
            </Text>
            <Text className="text-xs text-brand-500" numberOfLines={1}>
              {contactName ?? truncated} · {date.toLocaleDateString()}
            </Text>
          </View>
        </View>
        <View className="items-end">
          <Text className="text-sm font-semibold text-brand-900">
            {isOutgoing ? '-' : '+'}
            {entry.amount}
          </Text>
          <View className={`mt-0.5 rounded-md px-1.5 py-0.5 ${poolStyle.bg}`}>
            <Text className={`text-[10px] font-semibold ${poolStyle.text}`}>{entry.pool}</Text>
          </View>
        </View>
      </View>

      {/* Labels */}
      {labels && labels.length > 0 ? (
        <View className="mt-1.5 ml-9 flex-row flex-wrap gap-1">
          {labels.map((label) => (
            <View key={label} className="rounded-full bg-brand-100 px-2 py-0.5">
              <Text className="text-[10px] font-medium text-brand-700">{label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Note preview */}
      {noteContent ? (
        <View className="mt-1 ml-9">
          <Text className="text-xs text-brand-500 italic" numberOfLines={1}>
            {noteContent}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
