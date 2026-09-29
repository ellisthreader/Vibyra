import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Avatar } from '../ui/Avatar';
import { Icon, type IconName } from '../ui/primitives';
import type { Account } from '../ui/types';

const providers = {
  apple: { label: 'Apple', icon: 'logo-apple' as IconName },
  google: { label: 'Google', icon: null },
  github: { label: 'GitHub', icon: 'logo-github' as IconName },
  email: { label: 'email', icon: 'mail-outline' as IconName },
};

/**
 * The account, once it is signed in: the person's face rather than a row of fields.
 * Centred under the step's title the way iOS confirms an Apple Account — photo (or
 * the letter Avatar falls back to) with a verified badge, the name, the address it
 * signs in with, and a quiet pill naming the provider. The card it replaced put the
 * same three facts in a bordered strip, which read as a form control rather than an
 * answer to "you're all set".
 */
export function AccountSignedIn({ account }: { account: Account }) {
  const { colors, dark } = useTheme();
  const name = account.name?.trim();
  const provider = providers[account.provider ?? 'email'] ?? providers.email;
  return (
    <View style={s.block}>
      <View style={s.face}>
        <View style={[s.ring, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Avatar name={account.name} email={account.email} uri={account.avatarUrl} size={82} />
        </View>
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[s.badge, { backgroundColor: colors.success, borderColor: colors.background }]}
        >
          <Icon name="checkmark" size={14} color={dark ? '#0E0F12' : '#FFFFFF'} />
        </View>
      </View>
      <View style={s.who}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[s.name, !name && s.nameLong, { color: colors.text }]}
        >
          {name || account.email}
        </Text>
        {Boolean(name) && (
          <Text numberOfLines={1} style={[s.email, { color: colors.muted }]}>
            {account.email}
          </Text>
        )}
      </View>
      <View style={[s.pill, { backgroundColor: colors.elevated }]}>
        {provider.icon ? (
          <Icon name={provider.icon} size={14} color={colors.muted} />
        ) : (
          <Image
            source={require('../../assets/google-g.png')}
            style={s.google}
            accessible={false}
            aria-hidden
          />
        )}
        <Text style={[s.pillText, { color: colors.muted }]}>Signed in with {provider.label}</Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  block: { alignItems: 'center', gap: 14, paddingTop: 6, paddingBottom: 4 },
  face: { padding: 3 },
  ring: { padding: 3, borderRadius: 47, borderWidth: StyleSheet.hairlineWidth },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  who: { alignItems: 'center', gap: 3, alignSelf: 'stretch' },
  name: { fontSize: 19, fontWeight: '600', letterSpacing: -0.4, textAlign: 'center' },
  nameLong: { fontSize: 16.5, letterSpacing: -0.2 },
  email: { fontSize: 14, textAlign: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: { fontSize: 12.5, fontWeight: '500' },
  google: { width: 13, height: 13 },
});
