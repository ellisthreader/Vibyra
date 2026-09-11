import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { HostLinkAction } from './HostLinkAction';

const steps = ['Install Vibyra Host', 'Open it on your computer', 'Join the same Wi-Fi'];

/** Three things to do on the computer, then a button. No illustration: the
 *  steps are the screen, and a picture of a laptop tells nobody anything the
 *  words did not already say. */
export function ConnectSetup({ workspace, onInstalled }: { workspace: WorkspaceModel; onInstalled: () => void }) {
  const { colors } = useTheme();
  return <View style={s.body}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Connect your computer</Text>
      <View style={s.steps}>
        {steps.map((text, index) =>
          <View key={text} accessible accessibilityLabel={`Step ${index + 1}. ${text}`} style={s.step}>
            <Text style={[s.number, { color: colors.muted }]}>{index + 1}</Text>
            <Text style={[s.stepText, { color: colors.text }]}>{text}</Text>
          </View>)}
      </View>
    </ScrollView>
    <View style={s.actions}>
      <Button title="I’ve installed it" onPress={onInstalled} />
      {/* Installing happens on the computer, so step 1 is reachable from here. */}
      <HostLinkAction workspace={workspace} />
    </View>
  </View>;
}

const s = StyleSheet.create({
  body: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 8, paddingBottom: 16, gap: 26 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.8 },
  steps: { gap: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 },
  number: { fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'], width: 16 },
  stepText: { flex: 1, fontSize: 16, lineHeight: 22 },
  actions: { paddingHorizontal: 26, paddingTop: 12, paddingBottom: 8, gap: 4 },
});
