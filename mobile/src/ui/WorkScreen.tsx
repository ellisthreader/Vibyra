import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import { font, GUTTER, radius } from './font';
import { knownProjects, isIdeas } from './ideas';
import { Hint, Icon, type IconName } from './primitives';
import type { WorkspaceModel } from './types';
import { useTourTarget } from '../tour/tourTargets';

interface StartOption {
  title: string;
  detail: string;
  icon: IconName;
  onPress(): void;
}

/** A small launch menu: every row goes directly to a useful next step. */
export function WorkScreen({ workspace, connected, onProjects, onNewProject, onConnect, onAgents }: {
  workspace: WorkspaceModel; connected: boolean; onProjects(): void;
  onNewProject?(): void; onConnect?(): void; onAgents?(): void;
}) {
  const { colors } = useTheme();
  const compact = useWindowDimensions().height < 700;
  const hasProjects = knownProjects(workspace).some((project) => !isIdeas(project));
  const options: StartOption[] = [];
  const startTarget = useTourTarget('start');

  if (connected) {
    if (hasProjects) options.push({ title: 'Open a project', detail: 'Return to your shared folders and terminals.',
      icon: 'folder-open-outline', onPress: onProjects });
    if (!workspace.viewOnly && onNewProject) options.push({ title: 'Start a project', detail: 'Create a workspace on your computer.',
      icon: 'add-circle-outline', onPress: onNewProject });
    if (workspace.viewOnly && !hasProjects && onConnect) options.push({ title: 'Connect another computer',
      detail: 'Choose a computer with projects to work on.', icon: 'desktop-outline', onPress: onConnect });
  } else {
    if (onConnect) options.push({ title: 'Connect your computer', detail: 'Open your projects and terminals on this phone.',
      icon: 'desktop-outline', onPress: onConnect });
    if (hasProjects) options.push({ title: 'Browse saved projects', detail: 'See folders from your last connection.',
      icon: 'folder-open-outline', onPress: onProjects });
  }
  if (onAgents) options.push({ title: 'Open Agents', detail: 'Set up a teammate or continue a task.',
    icon: 'people-outline', onPress: onAgents });

  return <ScrollView style={s.screen} contentContainerStyle={[s.content, { backgroundColor: colors.background }]}>
    <View style={s.layout}>
      <Text accessibilityRole="header" style={[s.title, compact && s.compactTitle, { color: colors.text }]}>
        What would you like to do?
      </Text>
      <View style={[s.options, compact && s.compactOptions]}>
        {options.map((option, index) => index === 0
          ? <View key={option.title} ref={startTarget} collapsable={false}><StartRow option={option} first compact={compact} /></View>
          : <StartRow key={option.title} option={option} first={false} compact={compact} />)}
      </View>
      {connected && workspace.host?.name && <View style={s.connection}>
        <View style={[s.connectionDot, { backgroundColor: workspace.demo ? colors.muted : colors.success }]} />
        <Text style={[s.connectionText, { color: colors.muted }]} numberOfLines={1}>
          {workspace.demo ? 'Sample workspace' : `Connected to ${workspace.host.name}`}
        </Text>
      </View>}
      {workspace.error && <View style={s.error}><Hint error>{workspace.error}</Hint></View>}
    </View>
  </ScrollView>;
}

function StartRow({ option, first, compact }: { option: StartOption; first: boolean; compact: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={option.title}
    accessibilityHint={option.detail} onPress={option.onPress}
    style={({ pressed }) => [s.row, compact && s.compactRow, { backgroundColor: first ? colors.action : pressed ? colors.elevated : colors.surface,
      borderColor: first ? colors.action : colors.border }, first && pressed && s.pressed]}>
    <View style={[s.icon, compact && s.compactIcon, { backgroundColor: first ? 'transparent' : colors.elevated }]}>
      <Icon name={option.icon} size={compact ? 21 : 23} color={first ? colors.onAction : colors.muted} />
    </View>
    <View style={s.rowCopy}>
      <Text style={[s.rowTitle, compact && s.compactRowTitle, { color: first ? colors.onAction : colors.text }]}>{option.title}</Text>
      <Text style={[s.rowDetail, compact && s.compactRowDetail, { color: first ? colors.onAction : colors.muted }]}>{option.detail}</Text>
    </View>
    <Icon name="chevron-forward" size={18} color={first ? colors.onAction : colors.muted} />
  </Pressable>;
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: GUTTER + 4, paddingVertical: 28 },
  layout: { flexGrow: 1, width: '100%', maxWidth: 420, alignSelf: 'center', justifyContent: 'center' },
  title: { ...font.display, maxWidth: 320 },
  compactTitle: { fontSize: 28, lineHeight: 34 },
  options: { gap: 12, marginTop: 30 },
  compactOptions: { gap: 9, marginTop: 22 },
  row: { minHeight: 92, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  compactRow: { minHeight: 80, paddingHorizontal: 13, paddingVertical: 10, gap: 11 },
  icon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  compactIcon: { width: 39, height: 39, borderRadius: 11 },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { ...font.headline },
  compactRowTitle: { fontSize: 15, lineHeight: 20 },
  rowDetail: { ...font.footnote },
  compactRowDetail: { fontSize: 12, lineHeight: 16 },
  connection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 24 },
  connectionDot: { width: 6, height: 6, borderRadius: 3 },
  connectionText: { ...font.footnote, flexShrink: 1 },
  error: { marginTop: 16 },
  pressed: { transform: [{ scale: 0.99 }] },
});
