import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Switch, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { links } from '../settings/links';
import { palettes } from '../theme';
import type { MobileAnalytics } from './mobileAnalytics';
import type { ConsentSnapshot } from './mobileConsent';

/** First-run choice: service access is always available through Decline. */
export function PrivacyChoice({ visible, signedIn, analytics, consent }: {
  visible: boolean; signedIn: boolean; analytics: MobileAnalytics; consent: ConsentSnapshot;
}) {
  const [linkAccount, setLinkAccount] = useState(false);
  const dark = useColorScheme() !== 'light';
  const colors = dark ? palettes.dark : palettes.light;
  const choose = (choice: 'declined' | 'aggregate' | 'linked') => { void analytics.choose(choice); };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => choose('declined')}>
    <SafeAreaView style={[s.scrim, { backgroundColor: colors.scrim }]}>
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[s.mark, { backgroundColor: colors.accentSoft }]}>
          <Text style={[s.markText, { color: colors.accent }]}>V</Text>
        </View>
        <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Help us improve Vibyra</Text>
        <Text style={[s.body, { color: colors.muted }]}>
          With your permission, we’ll count which screens and features are used, prompt totals by model, and time spent actively using the app. We use an approximate country, never your precise location.
        </Text>
        <Text style={[s.body, { color: colors.muted }]}>
          We do not collect prompt text, terminal output, project names, file paths, or screen recordings for analytics.
        </Text>
        {signedIn && <View style={[s.linkRow, { borderColor: colors.border }]}>
          <View style={s.linkCopy}>
            <Text style={[s.linkTitle, { color: colors.text }]}>Link usage to my account</Text>
            <Text style={[s.linkDetail, { color: colors.muted }]}>Optional. Lets us understand account-level usage. Off by default.</Text>
          </View>
          <Switch value={linkAccount} onValueChange={setLinkAccount} accessibilityLabel="Link usage to my account"
            trackColor={{ true: colors.action, false: colors.border }} thumbColor="#FFFFFF" />
        </View>}
        {consent.error && <Text accessibilityRole="alert" style={[s.error, { color: colors.error }]}>{consent.error}</Text>}
        <View style={s.actions}>
          <Pressable testID="analytics-decline" accessibilityRole="button" disabled={consent.saving}
            onPress={() => choose('declined')} style={[s.button, { borderColor: colors.border, backgroundColor: colors.elevated }]}>
            <Text style={[s.buttonText, { color: colors.text }]}>Decline</Text>
          </Pressable>
          <Pressable testID="analytics-allow" accessibilityRole="button" disabled={consent.saving}
            onPress={() => choose(linkAccount && signedIn ? 'linked' : 'aggregate')}
            style={[s.button, { borderColor: colors.action, backgroundColor: colors.action }]}>
            <Text style={[s.buttonText, { color: colors.onAction }]}>{consent.saving ? 'Saving…' : 'Allow analytics'}</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(links.privacy).catch(() => {})}>
          <Text style={[s.privacy, { color: colors.muted }]}>Read the Privacy Policy</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  card: { width: '100%', maxWidth: 470, alignSelf: 'center', borderWidth: 1, borderRadius: 26, padding: 24, gap: 14 },
  mark: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  markText: { fontSize: 28, fontWeight: '800' },
  title: { fontSize: 25, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5 },
  body: { fontSize: 14, lineHeight: 21 },
  linkRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 15, padding: 12, gap: 8 },
  linkCopy: { flex: 1, gap: 4 },
  linkTitle: { fontSize: 14, fontWeight: '600' },
  linkDetail: { fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  button: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '700' },
  privacy: { textAlign: 'center', fontSize: 12, textDecorationLine: 'underline', paddingVertical: 5 },
  error: { fontSize: 13, lineHeight: 18 },
});
