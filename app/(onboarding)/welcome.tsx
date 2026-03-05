import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../src/components/Button';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <View className="flex-1 justify-between px-6 py-8">
        <View className="flex-1 items-center justify-center gap-4">
          <Ionicons name="wallet-outline" size={64} color="#232b83" />
          <Text className="text-3xl font-bold text-brand-900">Alphonse</Text>
          <Text className="text-center text-base text-brand-700">
            Permissionless, non-custodial wallet{'\n'}with neobank-style UX.
          </Text>
        </View>

        <View className="gap-3">
          <Button onPress={() => router.push('/(onboarding)/create')}>Create New Wallet</Button>
          <Button variant="secondary" onPress={() => router.push('/(onboarding)/import')}>
            Import Existing Wallet
          </Button>

          <Text className="mt-2 text-center text-xs text-brand-700">
            Non-custodial · Local signing · Encrypted storage
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
