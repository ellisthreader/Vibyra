import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Mark } from '../ui/BrandLogo';
import { Sheet } from '../ui/Sheet';
import { Button, Hint, Icon } from '../ui/primitives';
import { ConnectForm } from './ConnectForm';
import { useIntegrations } from './IntegrationsProvider';
import { integrationBrand } from './integrationBrands';
import type { Integration } from './types';

/**
 * One integration's page. The mark is centred at the top and everything else sits
 * under it, so the page opens on the thing a person recognises rather than on a
 * paragraph they have to read to find out where they are.
 *
 * Underneath is one short answer to the only question that matters before pasting
 * a key: what does this see, and what can it change. It used to be three sections —
 * a list of abilities, then what it reads, then what it writes — which is three
 * ways of saying the same thing and too much to take in at the moment you are
 * deciding whether to trust it. Two labelled lines, one above the other, can be
 * compared at a glance; a list has to be read.
 *
 * The `@mention` pill that used to sit beside the mark is gone. It labelled the
 * logo with the word already written at the top of the sheet, and nobody needs to
 * type it by hand — the button at the bottom puts it in a chat for you.
 *
 * The key form replaces the description inside this same sheet rather than opening
 * a second one - a modal presented while another is still on screen is the iOS
 * race this codebase has already been bitten by once.
 *
 * There is never a button that cannot work. An account without the feature and a
 * server that cannot be reached each say so in the footer instead. A person who
 * is signed out is offered sign-in before a key, not a refusal after pasting one,
 * and the form for it swaps into this sheet for the same reason the key form does.
 * The sample workspace offers the way out of itself, because nothing in it can
 * ever be connected.
 */
export function IntegrationPage({ integration, visible, onClose, onUse, signedIn = true, signIn, onLeaveSample }: {
  integration: Integration | null; visible: boolean; onClose(): void; onUse(mention: string): void;
  /** Whether a real account is signed in. The fixture and the sample leave this on. */
  signedIn?: boolean;
  /** The sign-in form, drawn in place of the description; `done` returns to it. */
  signIn?: (done: () => void) => ReactNode;
  onLeaveSample?: () => void;
}) {
  const { colors } = useTheme();
  const { catalogue, live, busy, error, connect, disconnect } = useIntegrations();
  const [mode, setMode] = useState<'details' | 'connect' | 'signin'>('details');
  const [credential, setCredential] = useState('');
  // What went wrong on this page, kept here rather than read from the provider so
  // that one service's refused key is never shown on the next service's page.
  const [failure, setFailure] = useState<string | null>(null);
  // Every open starts on the description, and a pasted key never survives a close.
  useEffect(() => { setMode('details'); setCredential(''); setFailure(null); }, [integration?.id, visible]);
  if (!integration) return null;
  // The prop is a snapshot; connecting changes the catalogue, not the card that opened this.
  const entry = catalogue.integrations.find(item => item.id === integration.id) ?? integration;
  const reason = (e: unknown) => e instanceof Error ? e.message : 'That did not work. Please try again.';
  const submit = async () => {
    setFailure(null);
    try { await connect(entry.id, credential.trim()); setMode('details'); setCredential(''); }
    catch (e) { setFailure(reason(e)); }
  };
  // Signed out: offer sign-in in place of the key, and hide the footer while the
  // form is up, since the form carries its own buttons.
  const signInFooter = mode === 'signin' ? undefined : signIn
    ? <Button title={'Sign in to connect ' + entry.name} icon="person-circle-outline" onPress={() => setMode('signin')} />
    : <Hint>{'Sign in to your Vibyra account to connect ' + entry.name + '.'}</Hint>;
  const footer = !live ? <Hint error>{error ?? 'Could not reach Vibyra, so integrations cannot be connected right now.'}</Hint>
    : catalogue.sample ? <View style={s.footerStack}>
      <Hint>{'This is the sample workspace, so nothing can be connected here. Leave it, then sign in to your Vibyra account to connect ' + entry.name + '.'}</Hint>
      {onLeaveSample && <Button title="Leave sample workspace" icon="exit-outline" onPress={onLeaveSample} />}
    </View>
    : !catalogue.enabled ? <Hint>Integrations are not switched on for this account yet.</Hint>
      : entry.installed ? <Button title="Use it in a chat" icon="arrow-forward" onPress={() => onUse(entry.mention)} />
        : !signedIn ? signInFooter
        : mode === 'connect' ? <Button title="Connect" busy={busy} disabled={!credential.trim()} onPress={() => void submit()} />
          : <Button title={'Connect ' + entry.name} icon="key-outline" onPress={() => setMode('connect')} />;
  return <Sheet title={entry.name} visible={visible} onClose={onClose} footer={footer}>
    <View style={s.hero}>
      <Mark brand={integrationBrand(entry.id)} size={72} />
      {entry.installed
        ? <View style={s.account}>
          <Icon name="checkmark-circle" size={14} color={colors.success} />
          <Text numberOfLines={1} style={[s.accountText, { color: colors.success }]}>
            {entry.account ? 'Connected as ' + entry.account : 'Connected'}</Text>
        </View>
        : <Text numberOfLines={1} style={[s.accountText, { color: colors.muted }]}>{entry.category}</Text>}
    </View>
    {mode === 'signin' && signIn ? signIn(() => setMode('details'))
      : mode === 'connect' ? <ConnectForm integration={entry} value={credential} onChange={setCredential} error={failure} /> : <>
      <Text style={[s.blurb, { color: colors.text }]}>{entry.blurb}</Text>
      {/* The safety answer, and the whole of it. Reads first because it is always
          the larger permission; writes second and in full text colour, because what
          something can change in your account is the one line here that must never
          read as small print. */}
      <View style={[s.safety, { borderColor: colors.border }]}>
        {entry.reads && <Safety icon="eye-outline" label="Reads" text={entry.reads} muted />}
        {entry.reads && entry.writes && <View style={[s.divider, { backgroundColor: colors.border }]} />}
        {entry.writes && <Safety icon="create-outline" label="Changes" text={entry.writes} />}
      </View>
      {entry.installed && <Pressable accessibilityRole="button" accessibilityLabel={'Disconnect ' + entry.name}
        onPress={() => { setFailure(null); void disconnect(entry.id).catch(e => setFailure(reason(e))); }} disabled={busy}
        style={({ pressed }) => [s.disconnect, { borderColor: colors.border, opacity: busy ? 0.4 : pressed ? 0.6 : 1 }]}>
        <Text style={[s.disconnectText, { color: colors.error }]}>Disconnect</Text>
      </Pressable>}
      {/* A server we cannot reach is already said once, in the footer. This line is
          for the failure the footer has no room for: a disconnect that did not take. */}
      {failure && <Hint error>{failure}</Hint>}
    </>}
  </Sheet>;
}

/** One half of the safety block: a mark, the word for it, and the sentence. */
function Safety({ icon, label, text, muted = false }: {
  icon: 'eye-outline' | 'create-outline'; label: string; text: string; muted?: boolean;
}) {
  const { colors } = useTheme();
  return <View style={s.row}>
    <Icon name={icon} size={16} color={colors.muted} />
    <View style={s.rowText}>
      <Text accessibilityRole="header" style={[s.rowLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[s.rowBody, { color: muted ? colors.muted : colors.text }]}>{text}</Text>
    </View>
  </View>;
}
const s = StyleSheet.create({
  hero: { alignItems: 'center', gap: 9 },
  footerStack: { gap: 10 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  accountText: { fontSize: 13 },
  blurb: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
  safety: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 46 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14 },
  rowText: { flex: 1, gap: 3 },
  rowLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  rowBody: { fontSize: 14, lineHeight: 20 },
  disconnect: { minHeight: 48, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  disconnectText: { fontSize: 15, fontWeight: '600' },
});
