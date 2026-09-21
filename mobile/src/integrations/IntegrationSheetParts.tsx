import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, type IconName } from '../ui/primitives';
import type { Integration } from './types';
import { links } from '../settings/links';

/** The title under the graphic, and one optional line under it, such as who it is connected as. */
export function Heading({ title, detail, success = false }: { title: string; detail?: string; success?: boolean }) {
  const { colors } = useTheme();
  return <View style={s.heading}>
    <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{title}</Text>
    {detail && <View style={s.detailRow}>
      {success && <Icon name="checkmark-circle" size={15} color={colors.success} />}
      <Text style={[s.detail, { color: success ? colors.success : colors.muted }]}>{detail}</Text>
    </View>}
  </View>;
}

/**
 * The access and data-use disclosure stays beside the person's decision. A
 * provider entry says where a mention sends things and how to revoke the
 * provider's grant; a device entry has no grant to revoke and no mention, so its
 * last two points say what stays on the Mac and where the setup lives.
 */
export function Disclosure({ entry, guest }: { entry: Integration; guest: boolean }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const device = entry.credential.kind === 'device';
  const points: { icon: IconName; title: string; body: string }[] = [
    ...(entry.reads ? [{ icon: 'eye-outline' as const, title: 'What Vibyra can see', body: entry.reads }] : []),
    ...(entry.writes ? [{ icon: 'create-outline' as const, title: 'What Vibyra can change', body: entry.writes }] : []),
    { icon: 'sparkles-outline', title: 'Where your data goes',
      body: device ? 'Approved tool results go to the AI provider and are saved with your chat, even when the reply does not quote them. Other files stay on your Mac.'
        : `When you mention ${entry.mention}, results go to the AI provider and are saved in your chat.` },
    { icon: 'lock-closed-outline', title: `Your ${entry.name} connection`,
      body: device ? `Set up and stopped on your Mac, in Vibyra's own Settings. Nothing about it is saved to your account or your guest session.`
        : `Access is encrypted. Disconnect here or revoke access in ${entry.name}. ${guest ? 'This connection is saved to your guest session.' : 'This connection is saved to your account.'}` },
  ];
  // Flat: the points sit on the card itself, parted by space rather than a panel or rules.
  return <View style={s.points}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}
      style={s.detailsToggle}>
      <Text style={[s.pointTitle, { color: colors.muted }]}>Access details</Text>
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
    </Pressable>
    {expanded && <>{!device && <Text style={[s.pointBody, { color: colors.muted }]}>
      {entry.name} may request broader permissions; Vibyra uses only the actions below.
    </Text>}{points.map(point => <View key={point.title} style={s.point}>
      <Icon name={point.icon} size={18} color={colors.muted} />
      <View style={s.pointText}>
        <Text style={[s.pointTitle, { color: colors.text }]}>{point.title}</Text>
        <Text style={[s.pointBody, { color: colors.muted }]}>{point.body}</Text>
      </View>
    </View>)}</>}
  </View>;
}

/** Keep the policy links available without filling the connection screen with prose. */
export function Consent() {
  const { colors } = useTheme();
  const link = (label: string, url: string) => <Text accessibilityRole="link" onPress={() => { void Linking.openURL(url); }}
    style={[s.link, { color: colors.accent }]}>{label}</Text>;
  return <Text style={[s.consent, { color: colors.muted }]}>
    By continuing, you agree to our {link('Terms', links.terms)} and {link('Privacy Policy', links.privacy)}.
  </Text>;
}

/** A quiet button for the way out, or a destructive one in the error colour. */
export function TextAction({ title, onPress, danger = false, disabled = false }: {
  title: string; onPress(): void; danger?: boolean; disabled?: boolean;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} disabled={disabled}
    accessibilityState={{ disabled }} style={({ pressed }) => [s.textAction, { opacity: disabled ? 0.4 : pressed ? 0.55 : 1 }]}>
    <Text style={[s.textActionLabel, { color: danger ? colors.error : colors.text }]}>{title}</Text>
  </Pressable>;
}

export const sheetStyles = StyleSheet.create({
  actions: { gap: 4 },
});

const s = StyleSheet.create({
  heading: { alignItems: 'center', gap: 6 },
  title: { fontSize: 23, lineHeight: 29, fontWeight: '700', letterSpacing: -0.6, textAlign: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detail: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  points: { gap: 16, paddingHorizontal: 2 },
  detailsToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pointText: { flex: 1, gap: 2 },
  pointTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  pointBody: { fontSize: 13.5, lineHeight: 18.5 },
  consent: { fontSize: 12.5, lineHeight: 18 },
  link: { fontWeight: '600' },
  textAction: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  textActionLabel: { fontSize: 16, fontWeight: '600' },
});
