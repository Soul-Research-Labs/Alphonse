import { Text, View, RefreshControl, ScrollView, Pressable } from 'react-native';
import { useState, useCallback, useEffect, useMemo } from 'react';

import type { TransactionHistoryEntry } from '@alphonse/evm';
import type { EnrichedTransaction } from '@alphonse/core';
import { enrichTransactions, exportToCsv } from '@alphonse/core';
import type { Contact, Label, Note } from '@alphonse/core';

import { SectionCard } from '../../src/components/SectionCard';
import { TxListItem } from '../../src/components/TxListItem';
import { Button } from '../../src/components/Button';
import { useWallet } from '../../src/context/WalletContext';

/** Filter options for the unified feed. */
type PoolFilter = 'ALL' | 'PUBLIC' | 'VAULT';

export default function ActivityScreen() {
  const { txTracker, evmClient, metadataManager, state } = useWallet();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<PoolFilter>('ALL');

  // Force re-render when entries change
  const [, setTick] = useState(0);

  // Metadata maps for enrichment
  const [labelsMap, setLabelsMap] = useState<ReadonlyMap<string, Label>>(new Map());
  const [notesMap, setNotesMap] = useState<ReadonlyMap<string, Note>>(new Map());
  const [contactsByAddress, setContactsByAddress] = useState<ReadonlyMap<string, Contact>>(
    new Map()
  );

  // Load metadata once on mount and after refresh
  const loadMetadata = useCallback(async () => {
    const [labelsRes, notesRes, contactsRes] = await Promise.all([
      metadataManager.labels.listLabels(),
      metadataManager.notes.list(),
      metadataManager.contacts.list(),
    ]);

    if (labelsRes.ok) {
      const map = new Map<string, Label>();
      for (const l of labelsRes.value) map.set(l.id, l);
      setLabelsMap(map);
    }
    if (notesRes.ok) {
      const map = new Map<string, Note>();
      for (const n of notesRes.value) map.set(n.id, n);
      setNotesMap(map);
    }
    if (contactsRes.ok) {
      const map = new Map<string, Contact>();
      for (const c of contactsRes.value) {
        if (c.address) map.set((c.address as string).toLowerCase(), c);
      }
      setContactsByAddress(map);
    }
  }, [metadataManager]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  const rawEntries = txTracker.getAll();

  // Filter by pool
  const filteredEntries = useMemo(
    () => (filter === 'ALL' ? rawEntries : rawEntries.filter((e) => e.pool === filter)),
    [rawEntries, filter]
  );

  // Enrich
  const enriched = useMemo(
    () =>
      enrichTransactions(
        filteredEntries as unknown as import('@alphonse/core').TransactionEntry[],
        labelsMap as ReadonlyMap<string, Label>,
        notesMap as ReadonlyMap<string, Note>,
        contactsByAddress as ReadonlyMap<string, Contact>,
        state.address as string | undefined
      ),
    [filteredEntries, labelsMap, notesMap, contactsByAddress, state.address]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([txTracker.refreshPending(evmClient), loadMetadata()]);
    setTick((t) => t + 1);
    setRefreshing(false);
  }, [txTracker, evmClient, loadMetadata]);

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ gap: 12 }}>
      {/* Pool filter */}
      <View className="flex-row gap-2 px-4 pt-2">
        {(['ALL', 'PUBLIC', 'VAULT'] as PoolFilter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            className={`rounded-full px-3 py-1 ${filter === f ? 'bg-brand-900' : 'bg-brand-100'}`}>
            <Text
              className={`text-xs font-semibold ${filter === f ? 'text-white' : 'text-brand-700'}`}>
              {f}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionCard title="Unified Activity" subtitle="Public and private feed with pool badges">
        {enriched.length === 0 ? (
          <View className="py-4">
            <Text className="text-center text-sm text-brand-500">
              No transactions yet. Send or receive funds to see activity here.
            </Text>
          </View>
        ) : (
          <View>
            {enriched.map((entry) => (
              <TxListItem
                key={entry.hash}
                entry={entry as unknown as TransactionHistoryEntry}
                labels={entry.labels as string[]}
                noteContent={entry.noteContent}
                contactName={entry.contactName}
              />
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
