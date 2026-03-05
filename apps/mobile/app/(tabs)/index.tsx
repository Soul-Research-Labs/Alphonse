import { Text, View, Pressable, RefreshControl, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { SectionCard } from '../../src/components/SectionCard';
import { useWallet } from '../../src/context/WalletContext';
import { useState, useCallback } from 'react';

export default function CheckingScreen() {
  const router = useRouter();
  const { state, refreshBalances } = useWallet();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshBalances();
    setRefreshing(false);
  }, [refreshBalances]);

  const balance = state.balanceFormatted ?? '0.0';
  const address = state.address
    ? `${(state.address as string).slice(0, 6)}...${(state.address as string).slice(-4)}`
    : '';

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ gap: 12 }}>
      <SectionCard title="Checking" subtitle="Public balance and day-to-day transfers">
        <Text className="text-3xl font-semibold text-brand-900">{balance} ETH</Text>
        {state.address ? <Text className="mt-1 text-sm text-brand-700">{address}</Text> : null}
        {state.tokenBalances.map((tb) => (
          <Text key={tb.token.symbol} className="mt-1 text-base text-brand-800">
            {tb.formatted} {tb.token.symbol}
          </Text>
        ))}
      </SectionCard>

      <View className="flex-row gap-3">
        <Pressable
          onPress={() => router.push('/send/address')}
          className="flex-1 rounded-2xl border border-brand-200 bg-white p-4">
          <Ionicons name="arrow-up-outline" size={20} color="#232b83" />
          <Text className="mt-1 text-base font-semibold text-brand-900">Send</Text>
          <Text className="text-sm text-brand-700">Public transfer</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/receive')}
          className="flex-1 rounded-2xl border border-brand-200 bg-white p-4">
          <Ionicons name="arrow-down-outline" size={20} color="#232b83" />
          <Text className="mt-1 text-base font-semibold text-brand-900">Receive</Text>
          <Text className="text-sm text-brand-700">Wallet address</Text>
        </Pressable>
      </View>

      <SectionCard title="Network">
        <Text className="text-sm text-brand-700">Connected to Sepolia Testnet</Text>
      </SectionCard>
    </ScrollView>
  );
}
