import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';

export type ConnectionStage = 'connecting' | 'approval' | 'connected' | 'failed';

export function ApprovalDisplay({ stage, scale }: { stage: ConnectionStage; scale: number }) {
  const { colors, dark } = useTheme();
  const still = useReducedMotion();
  const reveal = useRef(new Animated.Value(still ? 1 : 0)).current;
  const pointer = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) { reveal.setValue(1); pointer.setValue(1); return; }
    reveal.setValue(0); pointer.setValue(0);
    const native = { useNativeDriver: true, isInteraction: false };
    const animation = Animated.parallel([
      Animated.timing(reveal, { toValue: 1, duration: 600, delay: 250, easing: Easing.out(Easing.cubic), ...native }),
      Animated.timing(pointer, { toValue: 1, duration: 900, delay: 900, easing: Easing.bezier(0.22, 1, 0.36, 1), ...native }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [pointer, reveal, still]);
  const approval = stage === 'approval';
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? '#141927' : '#E8EDF8', alignItems: 'center', justifyContent: 'center' }]}>
    <View style={[s.desktop, { opacity: dark ? 0.25 : 0.4 }]}>
      {[0.6, 0.82, 0.45].map((fraction, index) => <View key={index} style={{ width: `${fraction * 100}%`, height: 3,
        borderRadius: 2, backgroundColor: colors.muted, marginBottom: 7 }} />)}
    </View>
    <Animated.View style={[s.scene, { transform: [{ scale }] }]}>
      {approval ? <Animated.View style={[s.prompt, { backgroundColor: colors.surface, borderColor: colors.border,
        opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
        <View style={s.promptTitle}>
          <Icon name="phone-portrait-outline" size={19} color={colors.accent} />
          <View style={{ gap: 2 }}>
            <Text style={[s.smallTitle, { color: colors.text }]}>Your iPhone</Text>
            <Text style={[s.smallDetail, { color: colors.muted }]}>wants to connect</Text>
          </View>
        </View>
        <View style={s.buttons}>
          <View style={[s.button, { backgroundColor: colors.elevated }]}><Text style={[s.buttonText, { color: colors.muted }]}>Deny</Text></View>
          <View style={[s.button, { backgroundColor: colors.action }]}><Text style={[s.buttonText, { color: colors.onAction }]}>Allow</Text></View>
        </View>
        <Animated.View style={[s.pointer, { opacity: pointer, transform: [
          { translateX: pointer.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
          { translateY: pointer.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
        ] }]}><Svg width={19} height={23} viewBox="0 0 19 23">
          <Path d="M3 2V19L8 15L12 22L15 20L11 13L18 12Z" fill={colors.text} stroke={colors.background} strokeWidth={1.5} strokeLinejoin="round" />
        </Svg></Animated.View>
      </Animated.View> : <Animated.View style={[s.rest, { opacity: reveal }]}>
        {stage === 'connecting' ? <ActivityIndicator size="small" color={colors.accent} />
          : <Icon name={stage === 'connected' ? 'checkmark-circle' : 'alert-circle-outline'} size={36}
            color={stage === 'connected' ? colors.success : colors.muted} />}
        <Text style={[s.smallTitle, { color: colors.text }]}>
          {stage === 'connected' ? 'Ready' : stage === 'failed' ? 'Try again' : 'Connecting…'}
        </Text>
      </Animated.View>}
    </Animated.View>
  </View>;
}
const s = StyleSheet.create({
  desktop: { position: 'absolute', left: 14, right: 14, top: 14 },
  scene: { width: 176, height: 102, alignItems: 'center', justifyContent: 'center' },
  prompt: { width: 168, padding: 12, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, gap: 11 },
  promptTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallTitle: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  smallDetail: { fontSize: 9, lineHeight: 12 },
  buttons: { flexDirection: 'row', gap: 6 },
  button: { flex: 1, height: 23, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 9, fontWeight: '600' },
  pointer: { position: 'absolute', right: 24, bottom: 2 },
  rest: { alignItems: 'center', justifyContent: 'center', gap: 8 },
});
