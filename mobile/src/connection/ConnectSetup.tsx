import { Animated, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useDrift, useEntrance } from '../onboarding/welcomeMotion';
import { useTheme } from '../theme';
import { Button } from '../ui/primitives';
import type { CloudComputer } from '../remote/remoteApi';
import type { WorkspaceModel } from '../ui/types';
import { CloudComputers } from './CloudComputers';
import { ConnectDevices } from './ConnectDevices';
import { useSheetDelay } from './ConnectionModal';
import { HostLinkAction } from './HostLinkAction';
import { font, GUTTER } from '../ui/font';

const steps = [
  ['Install Vibyra Desktop', 'Download the app on your computer.'],
  ['Open Vibyra Desktop', 'Keep the app running on your computer.'],
  ['Connect to the same Wi-Fi', 'Use the same network on both devices.'],
];

/** Three things to do on the computer, with the live computer-to-phone art
 *  between the title and the steps, then a button. A slow halo lights the stage
 *  so the devices sit in the same light as the sheet's header glow. An account
 *  that already has a computer signed in sees it first, reachable from here
 *  through Vibyra Cloud without any of the steps. */
export function ConnectSetup({
  workspace,
  onInstalled,
  onCloud,
}: {
  workspace: WorkspaceModel;
  onInstalled: () => void;
  onCloud: (computer: CloudComputer) => void;
}) {
  const { colors, dark } = useTheme();
  const { height } = useWindowDimensions();
  const halo = useDrift({ period: 16000, dx: 10, dy: -6, grow: 1.08, opacity: dark ? 0.34 : 0.16 });
  const compact = height < 740;
  const [title, art, list, actions] = useEntrance(4, useSheetDelay());
  return (
    <View style={s.body}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, compact && s.compact]}
      >
        <Animated.View style={[s.heading, title]}>
          <Text
            accessibilityRole="header"
            style={[s.title, compact && s.titleCompact, { color: colors.text }]}
          >
            Connect your{'\n'}
            <Text style={{ color: colors.accent }}>computer</Text>
          </Text>
          <Text style={[s.detail, { color: colors.muted }]}>
            Set up your computer, then find it from your phone.
          </Text>
        </Animated.View>
        <CloudComputers workspace={workspace} onSelect={onCloud} />
        <Animated.View
          style={[s.stage, { minHeight: compact ? 100 : 160, maxHeight: compact ? 130 : 220 }, art]}
        >
          <Animated.Image
            accessible={false}
            aria-hidden
            source={require('../../assets/glow-cobalt.png')}
            style={[s.halo, halo]}
          />
          <ConnectDevices scale={compact ? 0.66 : 0.92} />
        </Animated.View>
        <Animated.View
          style={[s.steps, { backgroundColor: colors.surface, borderColor: colors.border }, list]}
        >
          {steps.map(([text, detail], index) => (
            <View
              key={text}
              accessible
              accessibilityLabel={`Step ${index + 1}. ${text}. ${detail}`}
              style={[
                s.step,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View style={[s.number, { backgroundColor: colors.accentSoft }]}>
                <Text style={[s.digit, { color: colors.accent }]}>{index + 1}</Text>
              </View>
              <View style={s.stepCopy}>
                <Text style={[s.stepText, { color: colors.text }]}>{text}</Text>
                <Text style={[s.stepDetail, { color: colors.muted }]}>{detail}</Text>
              </View>
            </View>
          ))}
        </Animated.View>
      </ScrollView>
      <Animated.View style={[s.actions, { backgroundColor: colors.background }, actions]}>
        <Button title="I’ve installed it" icon="arrow-forward" onPress={onInstalled} />
        <HostLinkAction workspace={workspace} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  body: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingTop: 6,
    paddingBottom: 14,
    gap: 18,
  },
  compact: { paddingTop: 0, paddingBottom: 8, gap: 8 },
  heading: { gap: 12 },
  title: { fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -1.3 },
  titleCompact: { fontSize: 30, lineHeight: 35 },
  detail: { ...font.subhead, fontSize: 15, lineHeight: 21 },
  stage: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 440,
    height: 440,
    top: '50%',
    left: '50%',
    marginTop: -220,
    marginLeft: -220,
  },
  steps: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: 60,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  number: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stepCopy: { flex: 1, gap: 2 },
  stepText: { ...font.row, fontSize: 15.5, fontWeight: '600' },
  stepDetail: { ...font.footnote },
  actions: { paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: 8, gap: 4 },
});
