import { Text, View, ScrollView, Alert } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { DEFAULT_NETWORK } from '@alphonse/evm';

import { SectionCard } from '../../src/components/SectionCard';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Warning } from '../../src/components/Warning';
import { useWallet } from '../../src/context/WalletContext';

export default function SettingsScreen() {
  const { state, lock, changePassword, wipe } = useWallet();

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [wipeLoading, setWipeLoading] = useState(false);

  async function handleChangePassword() {
    setPwError('');
    setPwSuccess(false);

    if (newPw.length < 8) {
      setPwError('New password must be at least 8 characters');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('Passwords do not match');
      return;
    }

    setPwLoading(true);
    const ok = await changePassword(oldPw, newPw);
    setPwLoading(false);

    if (ok) {
      setPwSuccess(true);
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
      setShowChangePassword(false);
    } else {
      setPwError('Failed to change password. Check your current password.');
    }
  }

  function confirmWipe() {
    Alert.alert(
      'Wipe Wallet',
      'This will permanently delete all wallet data from this device. Make sure you have your recovery phrase backed up. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe Everything',
          style: 'destructive',
          onPress: async () => {
            setWipeLoading(true);
            await wipe();
            setWipeLoading(false);
          },
        },
      ]
    );
  }

  return (
    <ScrollView contentContainerStyle={{ gap: 12 }}>
      {/* Security section */}
      <SectionCard title="Security" subtitle="Wallet protection and access control">
        <View className="gap-3">
          <Button variant="secondary" onPress={lock}>
            Lock Wallet
          </Button>

          {!showChangePassword ? (
            <Button variant="secondary" onPress={() => setShowChangePassword(true)}>
              Change Password
            </Button>
          ) : (
            <View className="gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3">
              <Input
                label="Current Password"
                placeholder="Enter current password"
                value={oldPw}
                onChangeText={setOldPw}
                secureTextEntry
              />
              <Input
                label="New Password"
                placeholder="At least 8 characters"
                value={newPw}
                onChangeText={setNewPw}
                secureTextEntry
              />
              <Input
                label="Confirm New Password"
                placeholder="Repeat new password"
                value={confirmPw}
                onChangeText={setConfirmPw}
                secureTextEntry
                error={pwError}
              />
              {pwSuccess ? (
                <Warning severity="info" message="Password changed successfully." />
              ) : null}
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button onPress={handleChangePassword} loading={pwLoading}>
                    Save
                  </Button>
                </View>
                <View className="flex-1">
                  <Button
                    variant="secondary"
                    onPress={() => {
                      setShowChangePassword(false);
                      setPwError('');
                      setOldPw('');
                      setNewPw('');
                      setConfirmPw('');
                    }}>
                    Cancel
                  </Button>
                </View>
              </View>
            </View>
          )}
        </View>
      </SectionCard>

      {/* Network section */}
      <SectionCard title="Network" subtitle="Current EVM network configuration">
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-brand-700">Network</Text>
            <Text className="text-sm font-medium text-brand-900">{DEFAULT_NETWORK.name}</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-brand-700">Chain ID</Text>
            <Text className="text-sm font-medium text-brand-900">{DEFAULT_NETWORK.chainId}</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-brand-700">Currency</Text>
            <Text className="text-sm font-medium text-brand-900">
              {DEFAULT_NETWORK.nativeCurrency.symbol}
            </Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-brand-700">Explorer</Text>
            <Text className="text-sm font-medium text-brand-500">
              {DEFAULT_NETWORK.explorerUrl}
            </Text>
          </View>
        </View>
      </SectionCard>

      {/* Danger zone */}
      <SectionCard title="Danger Zone" subtitle="Irreversible actions">
        <View className="gap-3">
          <Warning
            severity="danger"
            message="Wiping the wallet permanently deletes all data. Ensure your recovery phrase is backed up."
          />
          <Button variant="danger" onPress={confirmWipe} loading={wipeLoading}>
            Wipe Wallet
          </Button>
        </View>
      </SectionCard>

      {/* Footer info */}
      <View className="rounded-2xl border border-brand-200 bg-white p-4">
        <Text className="text-xs text-brand-700">
          Non-custodial · Local signing · Encrypted storage
        </Text>
        <Text className="mt-1 text-xs text-brand-500">Alphonse v1 — Milestone 1</Text>
      </View>
    </ScrollView>
  );
}
