import { Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useEntrance } from '../onboarding/welcomeMotion';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { ConnectDevices } from './ConnectDevices';

const steps = ['Install Vibyra Host', 'Open it on your computer', 'Join the same Wi-Fi'];

export function ConnectSetup({ onInstalled, onPair }: { onInstalled: () => void; onPair: () => void }) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const compact = height < 740;
  const [title, art, list, actions] = useEntrance(4);
  return <View style={s.body}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.content, compact && s.compact]}>
      <Animated.Text accessibilityRole="header" style={[s.title, { color: colors.text }, title]}>
        Connect your{'\n'}<Text style={{ color: colors.accent }}>computer</Text>
      </Animated.Text>
      <Animated.View style={[s.stage, { minHeight: compact ? 158 : 190, maxHeight: compact ? 206 : 250 }, art]}>
        <ConnectDevices scale={compact ? 0.9 : 1} />
      </Animated.View>
      <Animated.View style={[s.steps, list]}>
        {steps.map((text, index) =>
          <View key={text} accessible accessibilityLabel={`Step ${index + 1}. ${text}`} style={s.step}>
            <View style={[s.number, { backgroundColor: colors.accentSoft }]}>
              <Text style={[s.digit, { color: colors.accent }]}>{index + 1}</Text>
            </View>
            <Text style={[s.stepText, { color: colors.text }]}>{text}</Text>
          </View>)}
      </Animated.View>
    </ScrollView>
    <Animated.View style={[s.actions, { backgroundColor: colors.background }, actions]}>
      <View style={[s.glow, { shadowColor: colors.accent }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="I’ve installed it" onPress={onInstalled}
          style={({ pressed }) => [s.primary, { backgroundColor: colors.action, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={[s.buttonText, { color: colors.onAction }]}>I’ve installed it</Text>
          <Icon name="arrow-forward" size={18} color={colors.onAction} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="I have a pairing code" onPress={onPair}
        style={({ pressed }) => [s.secondary, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[s.secondaryText, { color: colors.accent }]}>I have a pairing code</Text>
      </Pressable>
    </Animated.View>
  </View>;
}

const s = StyleSheet.create({
  body: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: 26, paddingTop: 6, paddingBottom: 14, gap: 18 },
  compact: { paddingTop: 0, paddingBottom: 8, gap: 12 },
  title: { fontSize: 36, lineHeight: 40, fontWeight: '700', letterSpacing: -1.4 },
  stage: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  steps: { paddingHorizontal: 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 15, minHeight: 52, paddingVertical: 8 },
  number: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  digit: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stepText: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '500', letterSpacing: -0.25 },
  actions: { paddingHorizontal: 26, paddingTop: 12, paddingBottom: 8, gap: 4 },
  glow: { borderRadius: 18, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  primary: { minHeight: 56, borderRadius: 18, paddingHorizontal: 22, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { flexShrink: 1, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  secondaryText: { fontSize: 15, fontWeight: '500', textAlign: 'center' },
});
