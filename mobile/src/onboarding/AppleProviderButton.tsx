import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import * as Apple from 'expo-apple-authentication';
import { useTheme } from '../theme';

export function AppleProviderButton({ busy, onPress, fallback }: { busy: boolean; onPress: () => void; fallback: ReactNode }) {
  const { dark } = useTheme();
  const [available, setAvailable] = useState(false);
  useEffect(() => { let mounted = true; void Apple.isAvailableAsync().then(value => { if (mounted) setAvailable(value); }).catch(() => {});
    return () => { mounted = false; }; }, []);
  if (!available) return fallback;
  return <View pointerEvents={busy ? 'none' : 'auto'} accessibilityState={{ disabled: busy }} style={{ opacity: busy ? 0.5 : 1 }}>
    <Apple.AppleAuthenticationButton buttonType={Apple.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={dark ? Apple.AppleAuthenticationButtonStyle.WHITE : Apple.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={14} style={{ width: '100%', height: 54 }} onPress={() => { if (!busy) onPress(); }} />
  </View>;
}
