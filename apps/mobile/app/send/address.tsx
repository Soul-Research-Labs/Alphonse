/**
 * Send flow — Step 1: Enter recipient address.
 *
 * Runs the address checker on every paste/input to detect:
 * - Invalid format
 * - Blocklisted addresses
 * - Similarity-based phishing (address poisoning)
 * - Self-send attempts
 * - Unknown addresses
 */

import { useState, useCallback } from 'react';
import { Text, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddressCheckStatus } from '@alphonse/core';
import type { Address } from '@alphonse/core';

import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Warning } from '../../src/components/Warning';
import { useWallet } from '../../src/context/WalletContext';

export default function SendAddressScreen() {
  const router = useRouter();
  const { state, addressChecker } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [warnings, setWarnings] = useState<{ message: string; severity: 'warning' | 'danger' }[]>(
    []
  );
  const [isValid, setIsValid] = useState(false);
  const [isRisky, setIsRisky] = useState(false);

  const runCheck = useCallback(
    (address: string) => {
      if (address.length === 0) {
        setWarnings([]);
        setIsValid(false);
        setIsRisky(false);
        return;
      }

      const result = addressChecker.check(address as Address, {
        ownAddresses: state.address ? [state.address] : [],
      });

      setIsValid(result.valid);
      setIsRisky(result.risky);

      const newWarnings: { message: string; severity: 'warning' | 'danger' }[] = [];
      for (const check of result.checks) {
        if (check.status === AddressCheckStatus.DETECTED) {
          const severity = check.type === 'UNKNOWN' ? 'warning' : 'danger';
          newWarnings.push({ message: check.message, severity });
        }
      }
      setWarnings(newWarnings);
    },
    [addressChecker, state.address]
  );

  function handleChangeText(text: string) {
    setRecipient(text.trim());
    runCheck(text.trim());
  }

  function handleContinue() {
    if (!isValid) return;
    router.push({
      pathname: '/send/amount',
      params: { to: recipient },
    });
  }

  const canContinue = isValid;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <ScrollView className="flex-1 px-6 pt-8" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-brand-900">Send</Text>
        <Text className="mt-2 text-sm text-brand-700">Enter the recipient's EVM address.</Text>

        <View className="mt-6 gap-4">
          <Input
            label="Recipient Address"
            placeholder="0x..."
            value={recipient}
            onChangeText={handleChangeText}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />

          {warnings.map((w, i) => (
            <Warning key={i} message={w.message} severity={w.severity} />
          ))}

          {isRisky ? (
            <Warning
              severity="danger"
              message="This address has been flagged as risky. Proceed with extreme caution."
            />
          ) : null}
        </View>

        <View className="mt-8 gap-3">
          <Button onPress={handleContinue} disabled={!canContinue}>
            {isRisky ? 'Continue Anyway' : 'Continue'}
          </Button>
          <Button variant="secondary" onPress={() => router.back()}>
            Cancel
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
