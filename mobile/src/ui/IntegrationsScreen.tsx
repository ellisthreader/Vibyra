import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { IntegrationPage } from '../integrations/IntegrationPage';
import { IntegrationRow } from '../integrations/IntegrationRow';
import { useIntegrations } from '../integrations/IntegrationsProvider';
import type { Integration } from '../integrations/types';
import { Button, Hint, Icon } from './primitives';

/**
 * The integration list. One sentence says what an integration is for, and the rows under it
 * are the services themselves, so the page answers "what can I connect?" before
 * anything is read.
 *
 * A worked example used to sit above the list — a chat bubble, a mention on a
 * tinted pill and a question — inside a surface card. It taught the feature to a
 * first-time reader once and then sat there for good, a grey band between the
 * sentence and the only part of the page you can act on, close enough in shape to
 * a search field to be mistaken for one. The lead sentence already says the same
 * thing in a line, and the mention itself is on each integration's own page next to the
 * button that uses it, which is where it is needed.
 *
 * Connected and not-connected are two groups rather than a badge on every row —
 * the state is the shape of the page, so "what do I have?" is answered without
 * reading anything. With nothing connected there is only one list, and no labels
 * over it to make an empty account look like a form to fill in.
 *
 * The shipped catalogue draws immediately, so the page is never blank. Only the
 * server knows what an account has connected, so when it cannot be reached the
 * page says so rather than showing three integrations as though none were connected.
 */
export function IntegrationsScreen({ onUse, signedIn, signIn, onLeaveSample }: {
  onUse(mention: string): void;
  /** Whether a real account is signed in; connecting needs one. */
  signedIn?: boolean;
  /** The sign-in form, drawn inside an integration's own sheet. */
  signIn?: (done: () => void) => ReactNode;
  /** Present only in the sample workspace, where nothing can be connected. */
  onLeaveSample?: () => void;
}) {
  const { colors } = useTheme();
  const { catalogue, live, error, refresh } = useIntegrations();
  const [open, setOpen] = useState<Integration | null>(null);
  // The provider fetches once per account, so a switch turned on at the server,
  // or a failure since recovered, stayed invisible until the app restarted.
  // Opening the destination is when the answer is wanted, so ask again then.
  useEffect(() => { void refresh(); }, [refresh]);
  const connected = catalogue.integrations.filter(integration => integration.installed);
  const rest = catalogue.integrations.filter(integration => !integration.installed);
  // Both groups filled is the only time a label earns its line.
  const label = connected.length > 0 && rest.length > 0;
  return <>
    <ScrollView contentContainerStyle={s.content} indicatorStyle={colors.text === '#F5F7FA' ? 'white' : 'black'}>
      <Text style={[s.lead, { color: colors.muted }]}>Connect an account, then mention it in a chat.</Text>
      {!live && error && <View style={s.notice}><Hint error>{error}</Hint></View>}
      {catalogue.sample && <View style={[s.notice, s.sample]}>
        <Hint>You are in the sample workspace, so nothing here can be connected. Leave it and sign in to connect your own accounts.</Hint>
        {onLeaveSample && <Button title="Leave sample workspace" icon="exit-outline" secondary onPress={onLeaveSample} />}
      </View>}
      <Group label={label ? 'Connected' : null} integrations={connected} onOpen={setOpen} />
      <Group label={label ? 'Available' : null} integrations={rest} onOpen={setOpen} />
      <View style={s.note}>
        <Icon name="lock-closed" size={13} color={colors.muted} />
        <Text style={[s.noteText, { color: colors.muted }]}>Keys are encrypted on Vibyra and never shown again.</Text>
      </View>
    </ScrollView>
    <IntegrationPage integration={open} visible={open !== null} onClose={() => setOpen(null)}
      onUse={mention => { setOpen(null); onUse(mention); }} signedIn={signedIn} signIn={signIn}
      onLeaveSample={onLeaveSample && (() => { setOpen(null); onLeaveSample(); })} />
  </>;
}

/** One inset card of rows. Three separate cards were three times the border. */
function Group({ label, integrations, onOpen }: { label: string | null; integrations: Integration[]; onOpen(integration: Integration): void }) {
  const { colors } = useTheme();
  if (!integrations.length) return null;
  return <View style={s.group}>
    {label && <Text accessibilityRole="header" style={[s.groupLabel, { color: colors.muted }]}>{label}</Text>}
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {integrations.map((integration, index) => <View key={integration.id}>
        {/* Inset to the text column, so the marks read as one stack rather than a table. */}
        {index > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
        <IntegrationRow integration={integration} onPress={() => onOpen(integration)} />
      </View>)}
    </View>
  </View>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 36 },
  lead: { fontSize: 15, lineHeight: 22 },
  notice: { marginTop: 16 },
  sample: { gap: 10 },
  group: { marginTop: 22 },
  groupLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, marginLeft: 4 },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 73 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 20, paddingHorizontal: 4 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
