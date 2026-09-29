import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';
import { AutoCore } from './AutoCore';
import { arrived } from './haptics';
import { AutoOrbitArt } from './AutoOrbitArt';
import { AutoOrbitTile } from './AutoOrbitTile';
import { useAutoSceneMotion } from './useAutoSceneMotion';
import { autoEffort, autoStatus, type AutoSelectionProgress } from './autoSelectionState';

export function AutoConstellation({
  progress,
  failed,
  visible = true,
}: {
  progress?: AutoSelectionProgress;
  failed: boolean;
  visible?: boolean;
}) {
  const { colors } = useTheme();
  const [height, setHeight] = useState(360);
  const selection = progress && 'selection' in progress ? progress.selection : undefined;
  const working = !!progress && !failed;
  const motion = useAutoSceneMotion(working, !!selection, visible && !failed);
  const candidates = useRef<{ id: string; name: string }[]>([]);
  if (progress?.phase === 'selecting') candidates.current = progress.candidates.slice(0, 6);
  if (!progress || progress.phase === 'checking') candidates.current = [];
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!selection) {
      announced.current = null;
      return;
    }
    if (visible && announced.current !== selection.model) {
      announced.current = selection.model;
      arrived();
    }
  }, [selection, visible]);
  const size = Math.min(280, Math.max(100, height - 108));
  const compact = size < 180;
  const mark = compact ? 42 : 68;
  const status = autoStatus(progress, failed);
  const turn = motion.orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const glow = motion.breath.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.85] });
  return (
    <View
      testID="auto-constellation"
      style={s.body}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: size, height: size }}
      >
        <Animated.View
          style={[
            s.layer,
            {
              opacity: glow,
              transform: [
                {
                  scale: motion.breath.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.88, 1.04],
                  }),
                },
              ],
            },
          ]}
        >
          <AutoOrbitArt color={colors.accent} size={size} />
        </Animated.View>
        <Animated.View
          testID="auto-orbit-motion"
          style={[
            s.layer,
            {
              opacity: Animated.multiply(motion.reveal, Animated.subtract(1, motion.resolve)),
              transform: [{ rotate: turn }],
            },
          ]}
        >
          <AutoOrbitArt color={colors.accent} size={size} />
        </Animated.View>
        {candidates.current.map((candidate, index) => (
          <AutoOrbitTile
            key={candidate.id}
            id={candidate.id}
            index={index}
            count={candidates.current.length}
            size={size}
            motion={motion}
          />
        ))}
        <AutoCore mark={mark} motion={motion} model={selection?.model} />
      </View>
      <View
        style={s.copy}
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          selection ? `${selection.name}. ${autoEffort(selection.effort)}. ${status}` : status
        }
      >
        <Text
          numberOfLines={2}
          style={[s.title, { color: colors.text, fontSize: compact ? 20 : 26 }]}
        >
          {selection?.name ?? 'Vibyra Auto'}
        </Text>
        {selection && (
          <View
            testID="auto-chosen-effort"
            style={[s.badge, { backgroundColor: colors.accentSoft }]}
          >
            <Icon name="checkmark" size={12} color={colors.accent} />
            <Text style={[s.effort, { color: colors.accent }]}>{autoEffort(selection.effort)}</Text>
          </View>
        )}
        <Text testID="auto-status" style={[s.status, { color: colors.muted }]}>
          {status}
        </Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
    overflow: 'hidden',
    paddingHorizontal: 22,
  },
  layer: { position: 'absolute', inset: 0 },
  copy: { alignItems: 'center', gap: 9, paddingBottom: 20, maxWidth: '100%' },
  title: { fontWeight: '700', letterSpacing: -0.7, textAlign: 'center' },
  status: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  effort: { fontSize: 11, fontWeight: '600' },
});
