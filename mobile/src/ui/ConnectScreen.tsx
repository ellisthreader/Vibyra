import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint, Icon } from './primitives';
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
    if (await run(() => workspace.actions.connect(value.trim()))) { setLink(''); onClose(); }
  };
  return <Sheet title="Connect your computer" visible={visible} onClose={onClose}>
    <Text style={[s.intro, { color: colors.muted }]}>Open Vibyra Host on your computer to get its pairing code or link.</Text>
    <View style={[s.trust, { borderColor: colors.border }]}>
      <Icon name="shield-checkmark-outline" size={18} color={colors.muted} />
      <Text style={[s.trustText, { color: colors.muted }]}>This phone can run commands with your computer account’s permissions. Pair only with a phone you trust.</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Scan QR code" accessibilityState={{ disabled: pending }}
      disabled={pending} onPress={() => setScanner(true)} style={({ pressed }) => [s.scan,
        { borderColor: colors.border, backgroundColor: colors.surface, opacity: pending ? 0.5 : pressed ? 0.7 : 1 }]}>
      <Icon name="scan-outline" size={25} />
      <View style={s.scanText}><Text style={[s.scanTitle, { color: colors.text }]}>Scan QR code</Text>
        <Text style={[s.scanDetail, { color: colors.muted }]}>Shown on your computer</Text></View>
      <Icon name="chevron-forward" size={17} color={colors.muted} />
    </Pressable>
    <View style={s.divider}><View style={[s.line, { backgroundColor: colors.border }]} />
      <Text style={[s.or, { color: colors.muted }]}>or use a pairing link</Text>
      <View style={[s.line, { backgroundColor: colors.border }]} /></View>
    <TextInput accessibilityLabel="Computer pairing link" value={link} onChangeText={setLink}
      placeholder="Paste pairing link" placeholderTextColor={colors.muted} autoCorrect={false}
      autoCapitalize="none" editable={!pending} multiline textContentType="none"
      style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
    {pending && <View accessibilityLiveRegion="polite" style={s.pending}>
      <ActivityIndicator color={colors.accent} /><Text style={[s.pendingText, { color: colors.text }]}>
        {workspace.status === 'pairing' ? 'Approve this phone on your computer…' : 'Connecting…'}
      </Text></View>}
    {(error || workspace.error) && <Hint error>{error || workspace.error}</Hint>}
    <Button title="Connect" busy={pending} disabled={!link.trim()} onPress={() => void connect(link)} />
    <Text style={[s.note, { color: colors.muted }]}>Keep your computer awake and Vibyra Host running.</Text>
    <ScannerSheet visible={scanner} onClose={() => setScanner(false)}
      onScan={value => { setScanner(false); void connect(value); }} />
  </Sheet>;
}
const s = StyleSheet.create({
  intro: { fontSize: 16, lineHeight: 24, paddingTop: 5 },
  trust: { flexDirection: 'row', gap: 10, paddingBottom: 21, paddingTop: 3, borderBottomWidth: StyleSheet.hairlineWidth },
  trustText: { flex: 1, fontSize: 13, lineHeight: 20 },
  scan: { minHeight: 81, padding: 17, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 15 },
  scanText: { flex: 1, gap: 5 }, scanTitle: { fontSize: 16, fontWeight: '500' }, scanDetail: { fontSize: 12 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 7 },
  line: { height: StyleSheet.hairlineWidth, flex: 1 }, or: { fontSize: 12 },
  input: { minHeight: 57, maxHeight: 135, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 17, fontSize: 15, lineHeight: 22 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 5 }, pendingText: { flex: 1, fontSize: 14, lineHeight: 21 },
  note: { textAlign: 'center', fontSize: 12, lineHeight: 19, marginTop: -3 },
});
