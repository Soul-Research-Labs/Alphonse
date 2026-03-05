import { Text, View, ScrollView, Alert, Share, Switch } from 'react-native';
import { useState, useCallback, useEffect } from 'react';

import { DEFAULT_NETWORK } from '@alphonse/evm';
import { enrichTransactions, exportToCsv } from '@alphonse/core';
import type { Contact, Label, Note } from '@alphonse/core';

import { SectionCard } from '../../src/components/SectionCard';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Warning } from '../../src/components/Warning';
import { useWallet } from '../../src/context/WalletContext';

export default function SettingsScreen() {
  const {
    state,
    lock,
    changePassword,
    wipe,
    txTracker,
    metadataManager,
    setProxySettings,
    setDuressSettings,
    connectHardwareWallet,
    disconnectHardwareWallet,
  } = useWallet();

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [wipeLoading, setWipeLoading] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);

  const [proxyHost, setProxyHost] = useState(state.proxy.host);
  const [proxyPort, setProxyPort] = useState(String(state.proxy.port));

  useEffect(() => {
    setProxyHost(state.proxy.host);
    setProxyPort(String(state.proxy.port));
  }, [state.proxy.host, state.proxy.port]);

  const handleExportCsv = useCallback(async () => {
    setCsvExporting(true);
    try {
      const entries = txTracker.getAll();
      if (entries.length === 0) {
        Alert.alert('No Data', 'No transactions to export.');
        return;
      }

      // Load metadata for enrichment
      const [labelsRes, notesRes, contactsRes] = await Promise.all([
        metadataManager.labels.listLabels(),
        metadataManager.notes.list(),
        metadataManager.contacts.list(),
      ]);

      const labelMap = new Map<string, Label>();
      if (labelsRes.ok) for (const l of labelsRes.value) labelMap.set(l.id, l);
      const noteMap = new Map<string, Note>();
      if (notesRes.ok) for (const n of notesRes.value) noteMap.set(n.id, n);
      const contactMap = new Map<string, Contact>();
      if (contactsRes.ok)
        for (const c of contactsRes.value)
          if (c.address) contactMap.set((c.address as string).toLowerCase(), c);

      const enriched = enrichTransactions(
        entries as unknown as import('@alphonse/core').TransactionEntry[],
        labelMap,
        noteMap,
        contactMap,
        state.address as string | undefined
      );

      const csv = exportToCsv(enriched);
      await Share.share({ message: csv, title: 'alphonse-transactions.csv' });
    } catch {
      Alert.alert('Export Failed', 'Could not export transaction data.');
    } finally {
      setCsvExporting(false);
    }
  }, [txTracker, metadataManager, state.address]);

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

  function applyProxySettings(enabled: boolean) {
    const parsedPort = Number.parseInt(proxyPort, 10);
    if (
      enabled &&
      (!proxyHost.trim() || !Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)
    ) {
      Alert.alert('Invalid Proxy', 'Please enter a valid host and port (1-65535).');
      return;
    }

    setProxySettings({
      ...state.proxy,
      enabled,
      host: proxyHost.trim(),
      port: parsedPort,
    });
  }

  async function handleConnectHardware(type: 'LEDGER' | 'TREZOR') {
    const ok = await connectHardwareWallet(type);
    if (!ok) {
      Alert.alert('Connection Failed', 'Unable to connect hardware wallet.');
    }
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

      <SectionCard title="Hardware Wallet" subtitle="Signing-only device approvals">
        <View className="gap-3">
          <Text className="text-xs text-brand-600">
            Ledger and Trezor support local signing only. Transaction approval always happens
            on-device.
          </Text>

          {state.hardwareWallet.connected ? (
            <View className="gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
              <Text className="text-sm font-medium text-brand-900">
                Connected: {state.hardwareWallet.type}
              </Text>
              <Button variant="secondary" onPress={disconnectHardwareWallet}>
                Disconnect Device
              </Button>
            </View>
          ) : (
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button variant="secondary" onPress={() => handleConnectHardware('LEDGER')}>
                  Connect Ledger
                </Button>
              </View>
              <View className="flex-1">
                <Button variant="secondary" onPress={() => handleConnectHardware('TREZOR')}>
                  Connect Trezor
                </Button>
              </View>
            </View>
          )}
        </View>
      </SectionCard>

      <SectionCard title="Network Privacy" subtitle="Optional proxy routing for RPC/sync">
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-brand-800">Route via Proxy</Text>
            <Switch
              value={state.proxy.enabled}
              onValueChange={applyProxySettings}
              trackColor={{ true: '#0f766e', false: '#d1d5db' }}
            />
          </View>
          <Input
            label="Proxy Host"
            placeholder="127.0.0.1"
            value={proxyHost}
            onChangeText={setProxyHost}
          />
          <Input
            label="Proxy Port"
            placeholder="9050"
            value={proxyPort}
            onChangeText={setProxyPort}
            keyboardType="number-pad"
          />
          <Text className="text-xs text-brand-600">
            If proxy routing fails, requests are blocked and you are notified. No silent direct
            fallback.
          </Text>
        </View>
      </SectionCard>

      <SectionCard title="Duress Protection" subtitle="Optional decoy and forensic wipe modes">
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-brand-800">Enable Decoy Wallet PIN</Text>
            <Switch
              value={state.duress.decoyEnabled}
              onValueChange={(enabled) =>
                setDuressSettings({ ...state.duress, decoyEnabled: enabled })
              }
              trackColor={{ true: '#0f766e', false: '#d1d5db' }}
            />
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-brand-800">Enable Forensic Wipe PIN</Text>
            <Switch
              value={state.duress.wipeEnabled}
              onValueChange={(enabled) =>
                setDuressSettings({ ...state.duress, wipeEnabled: enabled })
              }
              trackColor={{ true: '#991b1b', false: '#d1d5db' }}
            />
          </View>
          <Warning
            severity="warning"
            message="Duress modes are advanced security features. Configure carefully and test recovery before relying on them."
          />
        </View>
      </SectionCard>

      {/* Data Management section */}
      <SectionCard title="Data Management" subtitle="Export and backup your wallet data">
        <View className="gap-3">
          <Button variant="secondary" onPress={handleExportCsv} loading={csvExporting}>
            Export Transactions (CSV)
          </Button>
          <Text className="text-xs text-brand-500">
            Share your enriched transaction history as a CSV file with labels, notes, and contact
            names.
          </Text>
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
        <Text className="mt-1 text-xs text-brand-500">Alphonse v1 — Milestone 2</Text>
      </View>
    </ScrollView>
  );
}
