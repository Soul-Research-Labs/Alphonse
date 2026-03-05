import { useState, useCallback } from 'react';
import { Text, View, Pressable, RefreshControl, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { SectionCard } from '../../src/components/SectionCard';
import { useWallet } from '../../src/context/WalletContext';

export default function VaultScreen() {
  const router = useRouter();
  const { state, resyncVault, refreshVaultBalances } = useWallet();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshVaultBalances();
    setRefreshing(false);
  }, [refreshVaultBalances]);

  const ethBalance = state.vaultBalances.find((b) => b.assetSymbol === 'ETH')?.available ?? '0';

  const tokenBalances = state.vaultBalances.filter((b) => b.assetSymbol !== 'ETH');

  const lastSync = state.lastVaultSync
    ? new Date(Number(state.lastVaultSync)).toLocaleTimeString()
    : 'Never';

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ gap: 12 }}>
      <SectionCard title="Vault" subtitle="Private balance tracked by privacy adapter">
        <Text className="text-3xl font-semibold text-brand-900">{ethBalance} ETH</Text>
        {tokenBalances.map((tb) => (
          <Text key={tb.assetSymbol} className="mt-1 text-base text-brand-800">
            {tb.available} {tb.assetSymbol}
          </Text>
        ))}
        <Text className="mt-2 text-xs text-brand-500">Last synced: {lastSync}</Text>
      </SectionCard>

      <View className="flex-row gap-3">
        <Pressable
          onPress={() => router.push('/vault/shield')}
          className="flex-1 rounded-2xl border border-brand-200 bg-white p-4">
          <Ionicons name="lock-closed-outline" size={20} color="#232b83" />
          <Text className="mt-1 text-base font-semibold text-brand-900">Shield</Text>
          <Text className="text-sm text-brand-700">Public → Vault</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/vault/withdraw')}
          className="flex-1 rounded-2xl border border-brand-200 bg-white p-4">
          <Ionicons name="lock-open-outline" size={20} color="#232b83" />
          <Text className="mt-1 text-base font-semibold text-brand-900">Withdraw</Text>
          <Text className="text-sm text-brand-700">Vault → Public</Text>
        </Pressable>
      </View>

      <View className="flex-row gap-3">
        <Pressable
          onPress={() => router.push('/vault/private-send')}
          className="flex-1 rounded-2xl border border-brand-200 bg-white p-4">
          <Ionicons name="eye-off-outline" size={20} color="#232b83" />
          <Text className="mt-1 text-base font-semibold text-brand-900">Private Send</Text>
          <Text className="text-sm text-brand-700">Vault → Vault</Text>
        </Pressable>
        <Pressable
          onPress={resyncVault}
          disabled={state.vaultSyncing}
          className="flex-1 rounded-2xl border border-brand-200 bg-white p-4">
          {state.vaultSyncing ? (
            <ActivityIndicator size="small" color="#232b83" />
          ) : (
            <Ionicons name="refresh-outline" size={20} color="#232b83" />
          )}
          <Text className="mt-1 text-base font-semibold text-brand-900">Resync</Text>
          <Text className="text-sm text-brand-700">
            {state.vaultSyncing ? 'Syncing…' : 'Refresh private state'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
