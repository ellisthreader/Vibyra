import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import type { AccountProvider } from '../account/accountApi';
import { AppleProviderButton } from './AppleProviderButton';

export function ProviderButtons({ busy, active, onPress }: {
  busy: boolean; active: AccountProvider | null; onPress: (provider: AccountProvider) => void;
}) {
  const { colors, dark } = useTheme();
  return <View style={s.buttons}>
    {(['apple', 'google'] as const).map(provider => {
      const apple = provider === 'apple';
      const ink = apple ? (dark ? '#000000' : '#FFFFFF') : colors.text;
      const loading = busy && active === provider;
      const fallback = <Pressable accessibilityRole="button" accessibilityLabel={`Continue with ${apple ? 'Apple' : 'Google'}`}
        accessibilityState={{ disabled: busy, busy: loading }} aria-disabled={busy} disabled={busy} onPress={() => onPress(provider)}
        style={({ pressed }) => [s.button, { backgroundColor: apple ? (dark ? '#FFFFFF' : '#000000') : colors.surface,
          borderColor: apple ? 'transparent' : colors.border, opacity: busy && !loading ? 0.5 : pressed ? 0.75 : 1 }]}>
        <View style={s.icon}>{loading ? <ActivityIndicator color={ink} /> : apple ? <Icon name="logo-apple" size={22} color={ink} />
          : <Image source={require('../../assets/google-g.png')} style={s.google} accessible={false} />}</View>
        <Text style={[s.label, { color: ink }]}>{loading ? 'Connecting…' : `Continue with ${apple ? 'Apple' : 'Google'}`}</Text>
        <View style={s.icon} />
      </Pressable>;
      return apple ? <AppleProviderButton key={provider} busy={busy} onPress={() => onPress('apple')} fallback={fallback} />
        : <View key={provider}>{fallback}</View>;
    })}
  </View>;
}
const s = StyleSheet.create({
  buttons: { gap: 12 }, button: { minHeight: 54, paddingVertical: 14, paddingHorizontal: 17, borderRadius: 14,
    borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  icon: { width: 24, alignItems: 'center' }, google: { width: 20, height: 20 },
  label: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
});
