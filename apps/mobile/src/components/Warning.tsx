import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface WarningProps {
  message: string;
  severity?: 'info' | 'warning' | 'danger';
}

const BG = { info: 'bg-blue-50', warning: 'bg-yellow-50', danger: 'bg-red-50' };
const BORDER = { info: 'border-blue-200', warning: 'border-yellow-300', danger: 'border-red-300' };
const TEXT_COLOR = { info: 'text-blue-800', warning: 'text-yellow-800', danger: 'text-red-800' };
const ICON_COLOR = { info: '#1e40af', warning: '#92400e', danger: '#991b1b' };
const ICON_NAME = {
  info: 'information-circle-outline' as const,
  warning: 'warning-outline' as const,
  danger: 'alert-circle-outline' as const,
};

export function Warning({ message, severity = 'warning' }: WarningProps) {
  return (
    <View
      className={`flex-row items-start gap-2 rounded-xl border p-3 ${BG[severity]} ${BORDER[severity]}`}>
      <Ionicons name={ICON_NAME[severity]} size={20} color={ICON_COLOR[severity]} />
      <Text className={`flex-1 text-sm ${TEXT_COLOR[severity]}`}>{message}</Text>
    </View>
  );
}
