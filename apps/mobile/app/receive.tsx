/**
 * Receive screen — displays the wallet address and a QR code.
 *
 * Users can copy their address to the clipboard or let others
 * scan the QR code.
 */

import { useState } from 'react';
import { Text, View, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { Button } from '../src/components/Button';
import { Warning } from '../src/components/Warning';
import { useWallet } from '../src/context/WalletContext';

export default function ReceiveScreen() {
  const router = useRouter();
  const { state } = useWallet();
  const [copied, setCopied] = useState(false);

  const address = (state.address as string) ?? '';

  async function handleCopy() {
    if (address) {
      await Clipboard.setStringAsync(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <ScrollView className="flex-1 px-6 pt-8" contentContainerStyle={{ alignItems: 'center' }}>
        <Text className="text-2xl font-bold text-brand-900">Receive</Text>
        <Text className="mt-2 text-sm text-brand-700">
          Share your address or QR code to receive funds.
        </Text>

        {/* QR Code */}
        <View className="mt-8 items-center rounded-2xl border border-brand-200 bg-white p-6">
          {address ? (
            <QRCode value={address} size={200} backgroundColor="white" color="#232b83" />
          ) : (
            <Text className="text-sm text-brand-700">No address available</Text>
          )}
        </View>

        {/* Address display */}
        <Pressable
          onPress={handleCopy}
          className="mt-6 w-full flex-row items-center justify-between rounded-xl border border-brand-200 bg-white px-4 py-3">
          <Text className="flex-1 text-xs text-brand-800" numberOfLines={2}>
            {address}
          </Text>
          <Ionicons
            name={copied ? 'checkmark-outline' : 'copy-outline'}
            size={20}
            color="#232b83"
            style={{ marginLeft: 8 }}
          />
        </Pressable>
        {copied ? <Text className="mt-1 text-xs text-brand-500">Copied to clipboard</Text> : null}

        <View className="mt-4 w-full">
          <Warning
            severity="info"
            message="This is your public EVM address. Only send ETH or supported ERC-20 tokens to this address."
          />
        </View>

        <View className="mt-8 w-full pb-8">
          <Button variant="secondary" onPress={() => router.back()}>
            Done
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
