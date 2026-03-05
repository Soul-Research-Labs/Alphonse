import { useState } from 'react';
import { Text, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Warning } from '../../src/components/Warning';
import { useWallet } from '../../src/context/WalletContext';

export default function CreateScreen() {
  const router = useRouter();
  const { state, createWallet } = useWallet();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordError =
    password.length > 0 && password.length < 8 ? 'Minimum 8 characters' : undefined;
  const confirmError =
    confirm.length > 0 && confirm !== password ? 'Passwords do not match' : undefined;
  const canSubmit = !passwordError && !confirmError && !loading;

  async function handleCreate() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const success = await createWallet(password);
      if (success) {
        router.replace('/(onboarding)/backup');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <ScrollView className="flex-1 px-6 pt-8" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-brand-900">Create Wallet</Text>
        <Text className="mt-2 text-sm text-brand-700">
          Set a strong password to encrypt your wallet on this device.
        </Text>

        <View className="mt-6 gap-4">
          <Input
            label="Password"
            placeholder="At least 8 characters"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            error={passwordError}
            autoFocus
          />
          <Input
            label="Confirm Password"
            placeholder="Repeat your password"
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            error={confirmError}
          />

          <Warning
            severity="info"
            message="Your password encrypts the wallet on this device only. Your recovery phrase is the ultimate backup — write it down and keep it safe."
          />

          {state.error ? <Warning severity="danger" message={state.error} /> : null}
        </View>

        <View className="mt-8">
          <Button onPress={handleCreate} disabled={!canSubmit} loading={loading}>
            Create Wallet
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
