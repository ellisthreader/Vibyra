import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';
import { font } from './font';
import type { WorkspaceModel } from './types';

export function DrawerComputerAction({ workspace, onPress }: { workspace: WorkspaceModel; onPress(): void }) {
  const { colors } = useTheme();
  const connected = Boolean(workspace.host && workspace.status === 'connected' && !workspace.demo);
  const name = workspace.host?.name ?? 'Connect a computer';
  const status = workspace.host ? workspace.demo ? 'Sample' : connected ? 'Connected' : 'Offline' : undefined;
  return <Pressable accessibilityRole="button" accessibilityLabel={status ? `${name}, ${status}` : name}
    onPress={onPress} style={({ pressed }) => [s.row, { backgroundColor: pressed ? colors.accentSoft : colors.elevated }]}>
    <Icon name="desktop-outline" size={18} color={colors.muted} />
    <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{name}</Text>
    {status && <View style={s.status}>
      <View style={[s.dot, { backgroundColor: connected ? colors.success : colors.muted }]} />
      <Text style={[s.caption, { color: colors.muted }]}>{status}</Text>
    </View>}
    <Icon name="chevron-forward" size={13} color={colors.muted} />
  </Pressable>;
}

const s = StyleSheet.create({
  row: { minHeight: 48, paddingHorizontal: 13, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { ...font.row, flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  caption: { ...font.footnote },
});
