// Must be first — polyfills crypto.getRandomValues for @noble/@scure
import '../src/polyfills';
import '../global.css';

import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { WalletProvider, useWallet } from '../src/context/WalletContext';

/** Redirects based on wallet state (onboarding / locked / unlocked). */
function NavigationGuard() {
  const { state } = useWallet();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (state.phase === 'loading') return;

    const inOnboarding = segments[0] === '(onboarding)';
    const inLock = segments[0] === 'lock';
    const inTabs = segments[0] === '(tabs)';

    if (state.phase === 'onboarding' && !inOnboarding) {
      router.replace('/(onboarding)/welcome');
    } else if (state.phase === 'locked' && !inLock) {
      router.replace('/lock');
    } else if (state.phase === 'unlocked' && !inTabs) {
      router.replace('/(tabs)');
    }
  }, [state.phase, segments]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <WalletProvider>
        <NavigationGuard />
      </WalletProvider>
    </SafeAreaProvider>
  );
}
