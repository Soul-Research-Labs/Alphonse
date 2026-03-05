import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../src/components/Button';
import { Input } from '../src/components/Input';
import { Warning } from '../src/components/Warning';
import { useWallet } from '../src/context/WalletContext';

export default function LockScreen() {
  const { state, unlock, unlockWithPin } = useWallet();
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const pinsConfigured = state.duressPinsConfigured;

  async function handleUnlock() {
    if (password.length === 0 || loading) return;
    setLoading(true);
    try {
      if (pinsConfigured && pin.length > 0) {
        await unlockWithPin(password, pin);
      } else {
        await unlock(password);
      }
      setPassword('');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <View className="flex-1 items-center justify-center px-6">
        <Ionicons name="lock-closed-outline" size={48} color="#232b83" />
        <Text className="mt-4 text-2xl font-bold text-brand-900">Wallet Locked</Text>
        <Text className="mt-2 text-center text-sm text-brand-700">
          Enter your password to unlock.
        </Text>

        <View className="mt-8 w-full gap-4">
          <Input
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={pinsConfigured ? undefined : handleUnlock}
            returnKeyType={pinsConfigured ? 'next' : 'go'}
            autoFocus
          />

          {pinsConfigured ? (
            <Input
              placeholder="PIN"
              secureTextEntry
              keyboardType="number-pad"
              value={pin}
              onChangeText={setPin}
              onSubmitEditing={handleUnlock}
              returnKeyType="go"
            />
          ) : null}

          {state.error ? <Warning severity="danger" message={state.error} /> : null}

          <Button onPress={handleUnlock} disabled={password.length === 0} loading={loading}>
            Unlock
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
