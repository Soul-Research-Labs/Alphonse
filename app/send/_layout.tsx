import { Stack } from 'expo-router';

export default function SendLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#f0f4ff' },
        animation: 'slide_from_right',
      }}
    />
  );
}
