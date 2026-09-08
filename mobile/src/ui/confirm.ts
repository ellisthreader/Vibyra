import { Alert, Platform } from 'react-native';

export function confirmAction(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm }]);
}
