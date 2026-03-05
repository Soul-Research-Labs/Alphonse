/**
 * Vault flow — Withdraw: enter amount to unshield from Vault → Public.
 */

import { useState, useMemo } from 'react';
import { Text, View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Warning } from '../../src/components/Warning';
import { useWallet } from '../../src/context/WalletContext';

interface AssetOption {
  symbol: string;
  balance: string;
  decimals: number;
  tokenAddress: string | null;
}

export default function WithdrawScreen() {
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
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const selected = assets[selectedIdx] ?? {
    symbol: 'ETH',
    balance: '0',
    decimals: 18,
    tokenAddress: null,
  };

  function handleMax() {
    setAmount(selected.balance);
    setError('');
  }

  function validate(): boolean {
    if (!amount || amount.trim() === '') {
      setError('Enter an amount');
      return false;
    }
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setError('Amount must be greater than 0');
      return false;
    }
    if (parsed > parseFloat(selected.balance)) {
      setError('Insufficient vault balance');
      return false;
    }
    setError('');
    return true;
  }

  function handleContinue() {
    if (!validate()) return;
    router.push({
      pathname: '/vault/confirm-withdraw',
      params: {
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

        <Text className="mt-4 text-2xl font-bold text-brand-900">Withdraw</Text>
        <Text className="mt-2 text-sm text-brand-700">
          Move funds from Vault back to Public (Checking)
        </Text>

        <Warning
          message="This transfer is public. Your withdrawal will be visible on-chain."
          severity="danger"
        />

        {assets.length > 1 && (
          <View className="mt-4 flex-row gap-2">
            {assets.map((a, i) => (
              <Pressable
                key={a.symbol}
                onPress={() => {
                  setSelectedIdx(i);
                  setAmount('');
                  setError('');
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
              setError('');
            }}
            keyboardType="decimal-pad"
            error={error}
          />
        </View>

        <View className="mt-8">
          <Button onPress={handleContinue}>Continue</Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
