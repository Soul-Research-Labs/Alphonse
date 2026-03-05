import { Text, View } from 'react-native';

import { SectionCard } from '../../src/components/SectionCard';

export default function VaultScreen() {
  return (
    <View className="gap-3">
      <SectionCard title="Vault" subtitle="Private balance tracked by privacy adapter">
        <Text className="text-3xl font-semibold text-brand-900">0.000 ETH</Text>
        <Text className="mt-1 text-sm text-brand-700">Shield to start private balance</Text>
      </SectionCard>

      <View className="flex-row gap-3">
        <View className="flex-1 rounded-2xl border border-brand-200 bg-white p-4">
          <Text className="text-sm text-brand-700">Shield</Text>
          <Text className="mt-1 text-base font-semibold text-brand-900">Public → Vault</Text>
        </View>
        <View className="flex-1 rounded-2xl border border-brand-200 bg-white p-4">
          <Text className="text-sm text-brand-700">Withdraw</Text>
          <Text className="mt-1 text-base font-semibold text-brand-900">Vault → Public</Text>
        </View>
      </View>

      <SectionCard title="Resync Vault" subtitle="Recovery and private state refresh" />
    </View>
  );
}
