import { TextInput, Text, View } from 'react-native';
import type { TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, ...props }: InputProps) {
  const borderColor = error ? 'border-red-400' : 'border-brand-200';

  return (
    <View>
      {label ? <Text className="mb-1.5 text-sm font-medium text-brand-800">{label}</Text> : null}
      <TextInput
        className={`rounded-xl border ${borderColor} bg-white px-4 py-3 text-base text-brand-900`}
        placeholderTextColor="#93aef8"
        {...props}
      />
      {error ? <Text className="mt-1 text-sm text-red-600">{error}</Text> : null}
    </View>
  );
}
