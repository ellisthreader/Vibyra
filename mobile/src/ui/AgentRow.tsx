import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandLogo } from './BrandLogo';
import { Icon } from './primitives';
import type { SessionKind } from './types';

export const AGENT_TILE = 40;
/** Who an agent is: its company's own mark, or a terminal for a plain shell. */
export function AgentMark({ kind, size = AGENT_TILE }: { kind: SessionKind; size?: number }) {
  const { colors } = useTheme();
  if (kind === 'claude') return <BrandLogo vendor="anthropic" size={size} />;
  if (kind === 'codex') return <BrandLogo vendor="openai" size={size} />;
  return <View style={[s.tile, { width: size, height: size, borderRadius: size / 3, backgroundColor: colors.elevated }]}>
    <Icon name="terminal-outline" size={size / 2} /></View>;
}

/**
 * One agent you can start: its mark, its name, one line on what it is, and a
 * chevron that becomes a spinner while it starts. Tapping the row is the
 * start; there is no button to press afterwards.
 */
export function AgentRow({ mark, name, detail, busy, disabled, prominent, onPress }: {
  mark: ReactNode; name: string; detail: string; busy?: boolean; disabled?: boolean; prominent?: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={name} aria-disabled={disabled} aria-busy={busy}
    accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.row, prominent && s.prominent, { opacity: disabled && !busy ? 0.4 : 1, backgroundColor: pressed ? colors.elevated : 'transparent' }]}>
    {mark}
    <View style={s.text}>
      <Text style={[s.name, prominent && s.largeName, { color: colors.text }]}>{name}</Text>
      <Text style={[s.detail, { color: colors.muted }]}>{detail}</Text>
    </View>
    {busy ? <ActivityIndicator color={colors.accent} /> : <Icon name={prominent ? 'arrow-forward' : 'chevron-forward'} size={prominent ? 19 : 16} color={colors.muted} />}
  </Pressable>;
}
const s = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 62, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  text: { flex: 1, gap: 3 },
  prominent: { minHeight: 84, paddingHorizontal: 8, paddingVertical: 17, gap: 14 },
  largeName: { fontSize: 17, lineHeight: 23, letterSpacing: -0.3 },
  name: { fontSize: 15.5, fontWeight: '600', letterSpacing: -0.2 },
  detail: { fontSize: 13, lineHeight: 17 },
});
