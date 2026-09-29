import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font, GUTTER } from '../ui/font';
import { Button } from '../ui/primitives';
import { usePreviewHostNoun } from './hostNoun';
import { PreviewTile } from './PreviewTile';
import type { PreviewTarget } from './types';

export function WindowConsent({ target, busy, onView, onCancel }: {
  target: PreviewTarget; busy: boolean; onView(): void; onCancel(): void;
}) {
  const { colors } = useTheme();
  const noun = usePreviewHostNoun();
  return <ScrollView contentContainerStyle={s.body} bounces={false}>
    <PreviewTile icon="desktop-outline" size={64} />
    <View style={s.words}>
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>View this application?</Text>
      <Text style={[s.name, { color: colors.text }]}>{target.name ?? 'Desktop application'}</Text>
      <Text style={[s.copy, { color: colors.muted }]}>Share this project’s window from your {noun} to this phone. Anything displayed in that window will be visible here, and you can tap and type in it while typing from your phone is on.</Text>
    </View>
    <View style={s.actions}>
      <Button title={busy ? 'Opening window…' : 'View this window'} icon="desktop-outline" disabled={busy} onPress={onView} />
      <Button title="Choose another preview" secondary disabled={busy} onPress={onCancel} />
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  body: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: GUTTER + 4, paddingVertical: 32, gap: 24 },
  words: { alignItems: 'center', gap: 8, maxWidth: 340 },
  title: { ...font.title2, textAlign: 'center' },
  name: { ...font.headline, textAlign: 'center' },
  copy: { ...font.body, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 4 },
  actions: { width: '100%', maxWidth: 420, gap: 10 },
});
