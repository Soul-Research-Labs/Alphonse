import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function Header() {
  return (
    <View className="mb-4 flex-row items-center justify-between">
      <View>
        <Text className="text-sm text-brand-700">Alphonse</Text>
        <Text className="text-xl font-semibold text-brand-900">Wallet</Text>
      </View>
      <View className="rounded-full border border-brand-200 bg-white px-3 py-1.5">
        <Text className="text-xs font-medium text-brand-800">Neobank UX</Text>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#f0f4ff' }}>
      <View className="flex-1 px-4 pt-2">
        <Header />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#ffffff',
              borderTopWidth: 1,
              borderTopColor: '#bfcffc',
              borderRadius: 16,
              marginHorizontal: 0,
              marginBottom: 8,
              paddingTop: 4,
              elevation: 0,
              shadowOpacity: 0,
            },
            tabBarActiveTintColor: '#232b83',
            tabBarInactiveTintColor: '#93aef8',
            tabBarLabelStyle: {
              fontSize: 12,
              fontWeight: '600',
            },
          }}>
          <Tabs.Screen
            name="index"
            options={{
              title: 'Checking',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="wallet-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="vault"
            options={{
              title: 'Vault',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="lock-closed-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="activity"
            options={{
              title: 'Activity',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="receipt-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="settings-outline" size={size} color={color} />
              ),
            }}
          />
        </Tabs>
      </View>
    </SafeAreaView>
  );
}
