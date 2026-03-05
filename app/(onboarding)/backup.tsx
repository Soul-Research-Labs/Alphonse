import { useState } from 'react';
import { Text, View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../src/components/Button';
import { Warning } from '../../src/components/Warning';
import { useWallet } from '../../src/context/WalletContext';

export default function BackupScreen() {
  const router = useRouter();
  const { state, clearPendingSrp } = useWallet();
  const [revealed, setRevealed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const words = state.pendingSrp?.split(' ') ?? [];

  function handleDone() {
    clearPendingSrp();
    // Navigation guard will redirect to (tabs) since phase is 'unlocked'
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <ScrollView className="flex-1 px-6 pt-8">
        <Text className="text-2xl font-bold text-brand-900">Back Up Recovery Phrase</Text>
        <Text className="mt-2 text-sm text-brand-700">
          Write down these {words.length} words in order. This is the ONLY way to recover your
          wallet if you lose access to this device.
        </Text>

        <Warning
          severity="danger"
          message="Never share your recovery phrase with anyone. Never enter it on a website. Alphonse will never ask for it."
        />

        <View className="mt-4 rounded-2xl border border-brand-200 bg-white p-4">
          {!revealed ? (
            <Pressable onPress={() => setRevealed(true)} className="items-center py-8">
              <Text className="text-base font-semibold text-brand-900">Tap to reveal</Text>
              <Text className="mt-1 text-sm text-brand-700">
                Make sure no one is looking at your screen.
              </Text>
            </Pressable>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {words.map((word, i) => (
                <View key={i} className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2">
                  <Text className="text-sm text-brand-900">
                    <Text className="text-brand-500">{i + 1}. </Text>
                    {word}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {revealed && !confirmed ? (
          <View className="mt-6">
            <Button variant="secondary" onPress={() => setConfirmed(true)}>
              I've Written It Down
            </Button>
          </View>
        ) : null}

        {confirmed ? (
          <View className="mt-6 gap-3">
            <Warning
              severity="info"
              message="Keep your recovery phrase in a safe, offline location. You can also find it later in Settings."
            />
            <Button onPress={handleDone}>Continue to Wallet</Button>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
