import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint } from '../ui/primitives';

export function SetupHelp() {
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    try { await Linking.openURL('https://github.com/ellisthreader/Vibyra/releases/tag/v0.6.0-host-preview'); setError(null); }
    catch { setError('Could not open downloads. On your computer, open Vibyra Desktop → Settings → Phone companion.'); }
  };
  return <View style={[s.box, { borderColor: colors.border, backgroundColor: colors.surface }]}>
    <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Set up your computer</Text>
    <Hint>1. In Vibyra Desktop, open Settings → Phone companion. Download Vibyra Host for Windows or Linux.</Hint>
    <Hint>2. Follow the setup command for a project you choose. Keep Host running and your computer awake.</Hint>
    <Hint>3. Paste the pairing link here, then approve this device in the Host console on your computer.</Hint>
    <Hint>{Platform.OS === 'web'
      ? 'The hosted browser app needs a secure connection (wss). For a local Wi-Fi connection, use the native phone preview or a locally served web app.'
      : 'For the phone preview, use the same trusted Wi-Fi network as your computer and its local network address.'}</Hint>
    <Button secondary title="Host downloads" icon="download-outline" onPress={() => void open()} />
    {error && <Hint error>{error}</Hint>}
  </View>;
}
const s = StyleSheet.create({ box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 20, gap: 15 },
  title: { fontSize: 18, fontWeight: '600' } });
