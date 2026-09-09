import { ActivityIndicator, Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import { useAppear, useBreath } from './radarMotion';

/** `active` is work the phone is doing. `holding` is work only the person at
 *  the computer can finish, so it pulses for attention instead of spinning. */
export type StageState = 'done' | 'active' | 'holding' | 'waiting' | 'failed';
export interface Stage { key: string; title: string; detail?: string; state: StageState }

/** The four real steps of a nearby connection, in the order the Host performs
 *  them. Nothing is marked done ahead of the transport reporting it, so the
 *  approval step keeps waiting for as long as the computer actually takes. */
export function ConnectProgress({ stages }: { stages: Stage[] }) {
  return <View style={s.list} accessibilityLiveRegion="polite">
    {stages.map((stage, index) => <Row key={stage.key} stage={stage} index={index}
      last={index === stages.length - 1} />)}
  </View>;
}
function Row({ stage, index, last }: { stage: Stage; index: number; last: boolean }) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const compact = height < 780;
  const still = useReducedMotion();
  const appear = useAppear(still, index * 90);
  const busy = stage.state === 'active' || stage.state === 'holding';
  const breath = useBreath(busy && !still, stage.state === 'holding' ? 1200 : 1600);
  const tone = stage.state === 'failed' ? colors.error : stage.state === 'done' ? colors.success
    : busy ? colors.accent : colors.muted;
  const status = stage.state === 'done' ? 'completed' : stage.state === 'failed' ? 'failed'
    : stage.state === 'holding' ? 'waiting for you' : stage.state === 'active' ? 'in progress' : 'not started';
  return <Animated.View style={[s.row, compact && s.rowTight, { opacity: appear,
    transform: [{ translateX: appear.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }]}
    accessible accessibilityLabel={`${stage.title}, ${status}${stage.detail ? `. ${stage.detail}` : ''}`}>
    <View style={s.track}>
      {!last && <View style={[s.connector, { backgroundColor: stage.state === 'done' ? colors.success : colors.border,
        opacity: stage.state === 'done' ? 0.5 : 1 }]} />}
      <Animated.View style={[s.marker, { borderColor: tone,
        backgroundColor: stage.state === 'done' ? colors.successSoft : colors.surface,
        transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }]}>
        {stage.state === 'active' ? <ActivityIndicator size="small" color={colors.accent} />
          : stage.state === 'done' ? <Icon name="checkmark" size={15} color={colors.success} />
            : stage.state === 'failed' ? <Icon name="close" size={15} color={colors.error} />
              : <View style={[s.dot, { backgroundColor: stage.state === 'holding' ? colors.accent : colors.border }]} />}
      </Animated.View>
    </View>
    <View style={[s.text, compact && s.textTight]}>
      <Text style={[s.title, { color: stage.state === 'waiting' ? colors.muted : colors.text }]}>{stage.title}</Text>
      {stage.detail && <Text style={[s.detail, { color: stage.state === 'failed' ? colors.error : colors.muted }]}>
        {stage.detail}</Text>}
    </View>
  </Animated.View>;
}
const s = StyleSheet.create({
  list: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 15, minHeight: 58 },
  rowTight: { minHeight: 48 },
  track: { width: 30, alignItems: 'center', alignSelf: 'stretch' },
  connector: { position: 'absolute', width: StyleSheet.hairlineWidth, top: 30, bottom: -4 },
  marker: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { flex: 1, paddingTop: 4, gap: 4, paddingBottom: 12 },
  textTight: { paddingBottom: 6, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  detail: { fontSize: 13, lineHeight: 19 },
});
