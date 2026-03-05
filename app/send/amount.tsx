/**
 * Send flow — Step 2: Enter amount.
 *
 * User enters the amount to send (ETH or a known ERC-20 token).
 * Shows available balance and provides a "Max" button.
 */

import { useState, useMemo } from 'react';
import { Text, View, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { useWallet } from '../../src/context/WalletContext';

interface AssetOption {
  symbol: string;
  decimals: number;
  balance: string;
  /** If non-null, this is an ERC-20 token (address of the contract). */
  tokenAddress: string | null;
}

export default function SendAmountScreen() {
  const router = useRouter();
  const { to } = useLocalSearchParams<{ to: string }>();
  const { state } = useWallet();

  // Available assets: ETH + known tokens with discovered balances
  const assets = useMemo<AssetOption[]>(() => {
    const list: AssetOption[] = [
      {
        symbol: 'ETH',
        decimals: 18,
        balance: state.balanceFormatted ?? '0',
        tokenAddress: null,
      },
    ];
    for (const tb of state.tokenBalances) {
      list.push({
        symbol: tb.token.symbol,
        decimals: tb.token.decimals,
        balance: tb.formatted,
        tokenAddress: tb.token.address as string,
      });
    }
    return list;
  }, [state.balanceFormatted, state.tokenBalances]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const selected = assets[selectedIdx];

  function handleMax() {
    setAmount(selected.balance);
    setError('');
  }

  function validate(): boolean {
    if (!amount || amount.trim() === '') {
      setError('Enter an amount');
      return false;
    }
    // Must be a valid number
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setError('Amount must be greater than 0');
      return false;
    }
    // Must not exceed balance
    if (parsed > parseFloat(selected.balance)) {
      setError('Insufficient balance');
      return false;
    }
    setError('');
    return true;
  }

  function handleContinue() {
    if (!validate()) return;
    router.push({
      pathname: '/send/confirm',
      params: {
        to,
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
        <Text className="text-2xl font-bold text-brand-900">Amount</Text>
        <Text className="mt-2 text-sm text-brand-700">
          Sending to {to ? `${to.slice(0, 8)}...${to.slice(-4)}` : ''}
        </Text>

        {/* Asset selector */}
        {assets.length > 1 ? (
          <View className="mt-6 flex-row gap-2">
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
        ) : null}

        {/* Balance */}
        <View className="mt-4 flex-row items-center justify-between">
          <Text className="text-sm text-brand-700">
            Available: {selected.balance} {selected.symbol}
          </Text>
          <Pressable onPress={handleMax}>
            <Text className="text-sm font-semibold text-brand-500">Max</Text>
          </Pressable>
        </View>

        {/* Amount input */}
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

        <View className="mt-8 gap-3">
          <Button onPress={handleContinue} disabled={!amount}>
            Review Transaction
          </Button>
          <Button variant="secondary" onPress={() => router.back()}>
            Back
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
