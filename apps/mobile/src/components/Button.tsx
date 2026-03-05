import { Text, Pressable, ActivityIndicator } from 'react-native';
import type { ReactNode } from 'react';

interface ButtonProps {
  onPress: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}

const VARIANT_STYLES = {
  primary: 'bg-brand-900',
  secondary: 'border border-brand-200 bg-white',
  danger: 'bg-red-600',
};

const TEXT_STYLES = {
  primary: 'text-white',
  secondary: 'text-brand-900',
  danger: 'text-white',
};

export function Button({
  onPress,
  children,
  variant = 'primary',
  disabled = false,
  loading = false,
}: ButtonProps) {
  const base = VARIANT_STYLES[variant];
  const text = TEXT_STYLES[variant];
  const opacity = disabled || loading ? 'opacity-50' : '';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`items-center rounded-2xl px-6 py-4 ${base} ${opacity}`}>
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? '#232b83' : '#ffffff'} />
      ) : (
        <Text className={`text-base font-semibold ${text}`}>{children}</Text>
      )}
    </Pressable>
  );
}
