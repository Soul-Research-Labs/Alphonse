import { Text, View } from 'react-native';
import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function SectionCard({ title, subtitle, children }: SectionCardProps) {
  return (
    <View className="rounded-2xl border border-brand-200 bg-white p-4">
      <Text className="text-base font-semibold text-brand-900">{title}</Text>
      {subtitle ? <Text className="mt-1 text-sm text-brand-700">{subtitle}</Text> : null}
      {children ? <View className="mt-4">{children}</View> : null}
    </View>
  );
}
