import { useEffect, useState, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text,
  useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { usePresence } from '../ui/presence';
import { Button, Hint, Icon, type IconName } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import { ConnectForm } from './ConnectForm';
import { ConnectionGraphic } from './ConnectionGraphic';
import { useIntegrations } from './IntegrationsProvider';
import { integrationBrand } from './integrationBrands';
import type { Integration } from './types';

const TERMS = 'https://vibyra.app/legal/terms';
const PRIVACY = 'https://vibyra.app/legal/privacy';

/**
 * Connecting a service, as one short card that rises from the bottom. It opens on
 * what is being joined to what (`ConnectionGraphic`), then says in four plain
 * points what Vibyra can see, what it can change, where the data goes and how the
 * key is kept, then the consent line with the Terms and Privacy Policy, then one
 * coloured button and a way out. That is the whole disclosure: it is written to
 * be read at the moment of deciding, so none of it hides behind a link.
 *
 * Every later step - signing in, pasting the key, the connected state - replaces
 * the card's content rather than opening a second modal over this one, which is
 * the iOS race this codebase has been bitten by. The dialog keeps the service's
 * name throughout, so assistive tech never announces a new place.
 */
export function IntegrationSheet({ integration, visible, onClose, onUse, signedIn = true, signIn }: {
  integration: Integration | null; visible: boolean; onClose(): void; onUse(mention: string): void;
  /** Whether a real account is signed in. Left out, as the fixture does, it is assumed. */
  signedIn?: boolean;
  /** The sign-in form, drawn in place of the key step; `done` moves on to the key. */
  signIn?: (done: () => void) => ReactNode;
}) {
  const { catalogue, live, busy, error, connect, disconnect } = useIntegrations();
  const [step, setStep] = useState<'consent' | 'signin' | 'key'>('consent');
  const [credential, setCredential] = useState('');
  // What went wrong in this card, kept here so one service's refusal is never shown for another.
  const [failure, setFailure] = useState<string | null>(null);
  // The card keeps drawing the last service while it slides away after the parent lets go.
  const [shown, setShown] = useState(integration);
  useEffect(() => { if (integration) setShown(integration); }, [integration]);
  // Every open starts on the disclosure, and a pasted key never survives a close.
  useEffect(() => { if (visible) { setStep('consent'); setCredential(''); setFailure(null); } }, [integration?.id, visible]);
  if (!shown) return null;
  // The prop is a snapshot; connecting changes the catalogue, not the row that opened this.
  const entry = catalogue.integrations.find(item => item.id === shown.id) ?? shown;
  const name = entry.name;
  const keyName = entry.credential.label.toLowerCase();
  const reason = (e: unknown) => e instanceof Error ? e.message : 'That did not work. Please try again.';
  const submit = async () => {
    setFailure(null);
    try { await connect(entry.id, credential.trim()); setStep('consent'); setCredential(''); }
    catch (e) { setFailure(reason(e)); }
  };
  const begin = () => { setFailure(null); setStep(signedIn ? 'key' : 'signin'); };

  let content: ReactNode;
  let actions: ReactNode;
  let consent: ReactNode = null;
  if (entry.installed) {
    content = <>
      <Heading title={`${name} is connected`} detail={entry.account ? `Connected as ${entry.account}` : undefined} success />
      <Disclosure entry={entry} />
      {failure && <Hint error>{failure}</Hint>}
    </>;
    actions = <>
      <Button title="Use it in a chat" icon="arrow-forward" onPress={() => onUse(entry.mention)} />
      <TextAction title={`Disconnect ${name}`} danger disabled={busy}
        onPress={() => { setFailure(null); void disconnect(entry.id).catch(e => setFailure(reason(e))); }} />
      <TextAction title="Done" onPress={onClose} />
    </>;
  } else if (step === 'signin' && signIn) {
    content = <>
      <Heading title={`Sign in to connect ${name}`} detail="Your key is saved to your Vibyra account, so connecting needs one." />
      {signIn(() => setStep('key'))}
    </>;
    actions = <TextAction title="Back" onPress={() => setStep('consent')} />;
  } else if (step === 'key') {
    content = <>
      <Heading title={`Paste your ${keyName}`} />
      <ConnectForm integration={entry} value={credential} onChange={setCredential} error={failure} />
    </>;
    actions = <>
      <Button title={`Connect ${name}`} busy={busy} disabled={!credential.trim()} onPress={() => void submit()} />
      <TextAction title="Back" onPress={() => { setFailure(null); setStep('consent'); }} />
    </>;
  } else {
    // There is never a button that cannot work: an unreachable server, a switch that
    // is off, or no way to sign in each say so where the button would be.
    const blocked = !live ? error ?? 'Checking your integrations…'
      : !catalogue.enabled ? 'Integrations are not switched on for this account yet.'
        : !signedIn && !signIn ? `Sign in to your Vibyra account to connect ${name}.` : null;
    content = <>
      <Heading title={`Connect ${name}`} />
      <Disclosure entry={entry} />
    </>;
    // Beside the button it qualifies, so it is on screen whenever the button is.
    consent = <Consent name={name} />;
    actions = <>
      {blocked ? <Hint error={!live && Boolean(error)}>{blocked}</Hint>
        : <Button title={`Connect ${name}`} onPress={begin} />}
      <TextAction title="Cancel" onPress={onClose} />
    </>;
  }
  return <Frame visible={visible} onClose={onClose} label={name} footer={<>
    {consent}
    <View style={s.actions}>{actions}</View>
  </>}>
    <ConnectionGraphic key={entry.id} brand={integrationBrand(entry.id)} connected={entry.installed} />
    {content}
  </Frame>;
}

/** The title under the graphic, and one optional line under it, such as who it is connected as. */
function Heading({ title, detail, success = false }: { title: string; detail?: string; success?: boolean }) {
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
 * The four things a person is agreeing to, in the order they would ask: what can
 * it see, what can it do, where does my data go, and what happens to my key. The
 * first two come from the catalogue, so they are exactly what that connector does;
 * a connector that only reads has no second row at all.
 */
function Disclosure({ entry }: { entry: Integration }) {
  const { colors } = useTheme();
  const points: { icon: IconName; title: string; body: string }[] = [
    ...(entry.reads ? [{ icon: 'eye-outline' as const, title: 'What Vibyra can see', body: entry.reads }] : []),
    ...(entry.writes ? [{ icon: 'create-outline' as const, title: 'What Vibyra can change', body: entry.writes }] : []),
    { icon: 'sparkles-outline', title: 'Where your data goes',
      body: `Only when you mention ${entry.mention} in a chat. What ${entry.name} returns is sent to the AI provider writing your reply and saved with that chat.` },
    { icon: 'lock-closed-outline', title: `Your ${entry.credential.label.toLowerCase()}`,
      body: `Encrypted on Vibyra and never shown again. Disconnect any time to delete it, or revoke it on ${entry.name}.` },
  ];
  return <View style={[s.points, { backgroundColor: colors.elevated }]}>
    {points.map((point, index) => <View key={point.title}>
      {index > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
      <View style={s.point}>
        <Icon name={point.icon} size={18} color={colors.muted} />
        <View style={s.pointText}>
          <Text style={[s.pointTitle, { color: colors.text }]}>{point.title}</Text>
          <Text style={[s.pointBody, { color: colors.muted }]}>{point.body}</Text>
        </View>
      </View>
    </View>)}
  </View>;
}

/** The consent line. Short, but it is the part that makes the tap an agreement. */
function Consent({ name }: { name: string }) {
  const { colors } = useTheme();
  const link = (label: string, url: string) => <Text accessibilityRole="link" onPress={() => { void Linking.openURL(url); }}
    style={[s.link, { color: colors.accent }]}>{label}</Text>;
  return <Text style={[s.consent, { color: colors.muted }]}>
    By connecting, you confirm you are allowed to share this account's data with Vibyra, and you agree to our{' '}
    {link('Terms', TERMS)} and {link('Privacy Policy', PRIVACY)}. {name}'s own terms still apply.
  </Text>;
}

/** A quiet button for the way out, or a destructive one in the error colour. */
function TextAction({ title, onPress, danger = false, disabled = false }: {
  title: string; onPress(): void; danger?: boolean; disabled?: boolean;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} disabled={disabled}
    accessibilityState={{ disabled }} style={({ pressed }) => [s.textAction, { opacity: disabled ? 0.4 : pressed ? 0.55 : 1 }]}>
    <Text style={[s.textActionLabel, { color: danger ? colors.error : colors.text }]}>{title}</Text>
  </Pressable>;
}

/**
 * The card: it rises over a dimmed screen, grows with its content up to most of the
 * screen, lifts with the keyboard, and closes from the scrim, the system back
 * gesture, or its own buttons. `footer` - the consent line and the buttons - stays
 * pinned to the bottom, so on a small phone the disclosure scrolls above it rather
 * than pushing the button you are deciding about off the screen; a hairline marks
 * the edge only while something is scrolled under it.
 */
function Frame({ visible, onClose, label, footer, children }: {
  visible: boolean; onClose(): void; label: string; footer: ReactNode; children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { mounted, value } = usePresence(visible, reduced);
  const [box, setBox] = useState(0);
  const [inner, setInner] = useState(0);
  if (!mounted) return null;
  const overflows = inner > box + 4;
  const rise = value.interpolate({ inputRange: [0, 1], outputRange: [Math.min(height, 760), 0] });
  return <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
    <View style={s.fill}>
      <Animated.View style={[s.fill, { backgroundColor: colors.scrim, opacity: value }]} />
      {/* The dimmed app closes the card on a tap. It is not announced: Cancel and Done are the accessible ways out. */}
      <Pressable style={s.fill} onPress={onClose} accessible={false} importantForAccessibility="no" aria-hidden />
      <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.dock}>
        <Animated.View accessibilityViewIsModal role={Platform.OS === 'web' ? 'dialog' : undefined} aria-label={label} aria-modal
          style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: height * 0.92,
            transform: [{ translateY: rise }] }]}>
          <View style={[s.grabber, { backgroundColor: colors.border }]} />
          <ScrollView style={s.scroll} bounces={overflows} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={overflows}
            onLayout={event => setBox(event.nativeEvent.layout.height)} onContentSizeChange={(_, h) => setInner(h)}
            contentContainerStyle={s.content}>
            {children}
          </ScrollView>
          <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 14) + 6,
            borderTopColor: overflows ? colors.border : 'transparent' }]}>{footer}</View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  </Modal>;
}
const s = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  dock: { flex: 1, justifyContent: 'flex-end' },
  card: { width: '100%', maxWidth: 560, alignSelf: 'center', borderTopLeftRadius: 30, borderTopRightRadius: 30,
    borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, overflow: 'hidden' },
  grabber: { width: 38, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 9 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 16, gap: 18 },
  footer: { paddingHorizontal: 24, paddingTop: 14, gap: 14, borderTopWidth: StyleSheet.hairlineWidth },
  heading: { alignItems: 'center', gap: 6 },
  title: { fontSize: 23, lineHeight: 29, fontWeight: '700', letterSpacing: -0.6, textAlign: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detail: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  points: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  pointText: { flex: 1, gap: 2 },
  pointTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  pointBody: { fontSize: 13.5, lineHeight: 18.5 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 30 },
  consent: { fontSize: 12.5, lineHeight: 18 },
  link: { fontWeight: '600' },
  actions: { gap: 4 },
  textAction: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  textActionLabel: { fontSize: 16, fontWeight: '600' },
});
