import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon, SectionLabel } from './primitives';
import { ScannerSheet } from './ScannerSheet';
import { Sheet } from './Sheet';
import { useAction } from './useAction';
import type { WorkspaceModel } from './types';

export function ConnectScreen({ visible, workspace, onClose }: {
  visible: boolean; workspace: WorkspaceModel; onClose: () => void;
}) {
  const { colors } = useTheme();
  const [link, setLink] = useState('');
  const [scanner, setScanner] = useState(false);
  const { busy, error, run } = useAction();
  const pending = busy || workspace.status === 'connecting' || workspace.status === 'pairing';
  const connect = async (value: string) => {
    setLink(value);
    const succeeded = await run(() => workspace.actions.connect(value.trim()));
    if (succeeded) { setLink(''); onClose(); }
  };
  return <Sheet title="Connect a computer" visible={visible} onClose={onClose}>
    <View style={[s.illustration, { backgroundColor: colors.surface }]}>
      <Icon name="desktop-outline" size={44} />
      <View style={s.connection}><View style={[s.dash, { backgroundColor: colors.border }]} />
        <Icon name="lock-closed" size={17} color={colors.accent} /><View style={[s.dash, { backgroundColor: colors.border }]} /></View>
      <Icon name="phone-portrait-outline" size={34} />
    </View>
    <Text style={[s.title, { color: colors.text }]}>Your computer does the work.</Text>
    <Hint>Run terminals and coding agents on your own machine. Keep working from your iPhone over an encrypted connection.</Hint>
    <View style={s.steps}>
      <Step number="1" text="Start Vibyra Host on your computer." />
      <Step number="2" text="Open its pairing link or scan the QR code." />
      <Step number="3" text="Approve this phone on your computer." />
    </View>
    {pending ? <View accessibilityLiveRegion="polite" style={[s.pending, { backgroundColor: colors.surface }]}>
      <ActivityIndicator color={colors.accent} /><Text style={[s.pendingText, { color: colors.text }]}>
        {workspace.status === 'pairing' ? 'Approve this phone on your computer…' : 'Connecting securely…'}
      </Text></View> : <Button title="Scan QR code" icon="scan-outline" onPress={() => setScanner(true)} />}
    <SectionLabel>Or paste a pairing link</SectionLabel>
    <TextInput accessibilityLabel="Computer pairing link" value={link} onChangeText={setLink}
      placeholder="vibyra://pair?…" placeholderTextColor={colors.muted} autoCorrect={false}
      autoCapitalize="none" editable={!pending} multiline textContentType="none"
      style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
    <Button title="Connect" secondary disabled={!link.trim() || pending} onPress={() => void connect(link)} />
    {(error || workspace.error) && <Hint error>{error || workspace.error}</Hint>}
    <Hint>Only pair with a computer you trust. It must stay awake and connected while your work runs.</Hint>
    <ScannerSheet visible={scanner} onClose={() => setScanner(false)}
      onScan={value => { setScanner(false); void connect(value); }} />
  </Sheet>;
}
function Step({ number, text }: { number: string; text: string }) {
  const { colors } = useTheme();
  return <View style={s.step}><View style={[s.number, { backgroundColor: colors.elevated }]}>
    <Text style={{ color: colors.text, fontWeight: '600' }}>{number}</Text></View>
    <Text style={[s.stepText, { color: colors.text }]}>{text}</Text></View>;
}
const s = StyleSheet.create({
  illustration: { height: 114, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 10 }, dash: { width: 14, height: 1 },
  title: { fontSize: 25, fontWeight: '600', letterSpacing: -0.6, marginTop: 8 },
  steps: { gap: 18, paddingVertical: 9 }, step: { flexDirection: 'row', gap: 13, alignItems: 'center' },
  number: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontSize: 15, lineHeight: 22 },
  input: { minHeight: 82, maxHeight: 180, borderRadius: 16, borderWidth: 1, padding: 15, fontSize: 14 },
  pending: { borderRadius: 17, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pendingText: { flex: 1, fontSize: 15, lineHeight: 22 },
});
