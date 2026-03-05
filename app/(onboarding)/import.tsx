import { useState } from 'react';
import { Text, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Warning } from '../../src/components/Warning';
import { useWallet } from '../../src/context/WalletContext';

export default function ImportScreen() {
  const router = useRouter();
  const { state, importWallet } = useWallet();
  const [srp, setSrp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const wordCount = srp.trim().split(/\s+/).filter(Boolean).length;
  const srpError =
    srp.length > 0 && wordCount !== 12 && wordCount !== 24
      ? `Enter 12 or 24 words (currently ${wordCount})`
      : undefined;
  const passwordError =
    password.length > 0 && password.length < 8 ? 'Minimum 8 characters' : undefined;
  const confirmError =
    confirm.length > 0 && confirm !== password ? 'Passwords do not match' : undefined;

  const canSubmit =
    (wordCount === 12 || wordCount === 24) &&
    password.length >= 8 &&
    password === confirm &&
    !loading;

  async function handleImport() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const success = await importWallet(srp.trim().toLowerCase(), password);
      if (success) {
        // Navigation guard redirects to (tabs)
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <ScrollView className="flex-1 px-6 pt-8" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-brand-900">Import Wallet</Text>
        <Text className="mt-2 text-sm text-brand-700">
          Enter your 12 or 24 word recovery phrase to restore your wallet.
        </Text>

        <View className="mt-6 gap-4">
          <Input
            label="Recovery Phrase"
            placeholder="Enter your recovery words separated by spaces"
            value={srp}
            onChangeText={setSrp}
            error={srpError}
            multiline
            numberOfLines={3}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="New Password"
            placeholder="At least 8 characters"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            error={passwordError}
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
            message="Your recovery phrase is processed locally and never leaves this device."
          />

          {state.error ? <Warning severity="danger" message={state.error} /> : null}
        </View>

        <View className="mt-8">
          <Button onPress={handleImport} disabled={!canSubmit} loading={loading}>
            Import Wallet
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
