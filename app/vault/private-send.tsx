/**
 * Vault flow — Private Send: enter recipient private ID and amount.
 *
 * Private-to-private requires a private receive identifier,
 * NOT a raw 0x address (per AGENTS.md UX rules).
 */

import { useState, useMemo } from 'react';
import { Text, View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { useWallet } from '../../src/context/WalletContext';

interface AssetOption {
  symbol: string;
  balance: string;
  decimals: number;
  tokenAddress: string | null;
}

export default function PrivateSendScreen() {
  const router = useRouter();
  const { state } = useWallet();

  const assets = useMemo<AssetOption[]>(() => {
    return state.vaultBalances.map((vb) => ({
      symbol: vb.assetSymbol,
      balance: vb.available as string,
      decimals: 18,
      tokenAddress: vb.assetSymbol === 'ETH' ? null : (vb.assetContract as string),
    }));
  }, [state.vaultBalances]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [recipientError, setRecipientError] = useState('');
  const [amountError, setAmountError] = useState('');

  const selected = assets[selectedIdx] ?? {
    symbol: 'ETH',
    balance: '0',
    decimals: 18,
    tokenAddress: null,
  };

  function handleMax() {
    setAmount(selected.balance);
    setAmountError('');
  }

  function validate(): boolean {
    let valid = true;

    if (!recipient || recipient.trim() === '') {
      setRecipientError('Enter a private receive identifier');
      valid = false;
    } else if (recipient.startsWith('0x') && recipient.length === 42) {
      setRecipientError(
        'This looks like a public address. Private send requires a private receive ID.'
      );
      valid = false;
    } else {
      setRecipientError('');
    }

    if (!amount || amount.trim() === '') {
      setAmountError('Enter an amount');
      valid = false;
    } else {
      const parsed = parseFloat(amount);
      if (isNaN(parsed) || parsed <= 0) {
        setAmountError('Amount must be greater than 0');
        valid = false;
      } else if (parsed > parseFloat(selected.balance)) {
        setAmountError('Insufficient vault balance');
        valid = false;
      } else {
        setAmountError('');
      }
    }

    return valid;
  }

  function handleContinue() {
    if (!validate()) return;
    router.push({
      pathname: '/vault/confirm-private-send',
      params: {
        recipient,
        amount,
        symbol: selected.symbol,
        decimals: String(selected.decimals),
        tokenAddress: selected.tokenAddress ?? '',
      },
    });
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <ScrollView className="flex-1 px-6 pt-8" keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}>
          <Text className="text-sm text-brand-500">← Back</Text>
        </Pressable>

        <Text className="mt-4 text-2xl font-bold text-brand-900">Private Send</Text>
        <Text className="mt-2 text-sm text-brand-700">
          Send privately from Vault to another Vault (V → V)
        </Text>

        <View className="mt-6">
          <Input
            label="Recipient (private receive ID)"
            placeholder="Private payment code or identifier"
            value={recipient}
            onChangeText={(t) => {
              setRecipient(t);
              setRecipientError('');
            }}
            error={recipientError}
          />
        </View>

        {assets.length > 1 && (
          <View className="mt-4 flex-row gap-2">
            {assets.map((a, i) => (
              <Pressable
                key={a.symbol}
                onPress={() => {
                  setSelectedIdx(i);
                  setAmount('');
                  setAmountError('');
                }}
                className={`rounded-xl border px-4 py-2 ${
                  i === selectedIdx ? 'border-brand-500 bg-brand-100' : 'border-brand-200 bg-white'
                }`}>
                <Text
                  className={`text-sm font-semibold ${
                    i === selectedIdx ? 'text-brand-900' : 'text-brand-700'
                  }`}>
                  {a.symbol}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View className="mt-4 flex-row items-center justify-between">
          <Text className="text-sm text-brand-700">
            Vault balance: {selected.balance} {selected.symbol}
          </Text>
          <Pressable onPress={handleMax}>
            <Text className="text-sm font-semibold text-brand-500">Max</Text>
          </Pressable>
        </View>

        <View className="mt-4">
          <Input
            label={`Amount (${selected.symbol})`}
            placeholder="0.0"
            value={amount}
            onChangeText={(t) => {
              setAmount(t);
              setAmountError('');
            }}
            keyboardType="decimal-pad"
            error={amountError}
          />
        </View>

        <View className="mt-8">
          <Button onPress={handleContinue}>Continue</Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
