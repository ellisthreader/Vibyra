import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './primitives';
import type { Project, Session } from './types';

/** Windows the stack draws; past that the number beside it does the counting. */
const STACKED = 3;
const [WIDTH, HEIGHT, STEP, RISE] = [26, 18, 8, 3];

/** How many terminals a project holds, and how many are running, in words. */
export function terminalWords(sessions: Session[]) {
  const running = sessions.filter(session => session.status === 'running').length;
  if (sessions.length === 0) return 'no terminals';
  return `${sessions.length} ${sessions.length === 1 ? 'terminal' : 'terminals'}${running ? `, ${running} running` : ''}`;
}

/**
 * The terminals in a project as a glance rather than a list: a small stack of
 * windows, one per terminal up to three, with the total beside it. A running
 * terminal's window carries the live dot, a stopped one the warning, an exited
 * one only its outline. Nothing in a window can be read, on purpose — the page
 * says how much is open in each project, and the project's own sheet says what.
 */
function TerminalStack({ sessions }: { sessions: Session[] }) {
  const { colors } = useTheme();
  const shown = sessions.slice(0, STACKED);
  const depth = shown.length - 1;
  const tone = (session: Session) => session.status === 'running' ? colors.success
    : session.status === 'interrupted' ? colors.warning : colors.border;
  return <View style={{ width: WIDTH + depth * STEP, height: HEIGHT + depth * RISE }}>
    {shown.map((session, index) => <View key={session.id} style={[s.window, { left: index * STEP,
      top: (depth - index) * RISE, zIndex: STACKED - index, backgroundColor: colors.elevated, borderColor: colors.border }]}>
      <View style={[s.pixel, { backgroundColor: tone(session) }]} />
      <View style={[s.line, { backgroundColor: colors.muted }]} />
      <View style={[s.line, s.short, { backgroundColor: colors.muted }]} />
    </View>)}
  </View>;
}

/**
 * One project in the list: a folder tile, its name, the branch it is on, and
 * how much is open inside it. The row enters the project; the terminals are
 * read in the rail there. `active` is the project whose terminal is open on the Work tab,
 * marked on the tile the way the rail marks the session itself.
 */
export function ProjectRow({ project, sessions, active, onPress, onOptions }: {
  project: Project; sessions: Session[]; active: boolean; onPress: () => void;
  /** Opens the project's own options — its name here, and removing it from the
   *  list. A long press as well as the button, because a row is a big target
   *  and holding it is what people try first. */
  onOptions?: () => void;
}) {
  const { colors } = useTheme();
  const running = sessions.filter(session => session.status === 'running').length;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${project.name}, ${terminalWords(sessions)}`}
    accessibilityHint="Opens this project" onPress={onPress} onLongPress={onOptions} delayLongPress={400}
    style={({ pressed }) => [s.row, { opacity: pressed ? 0.55 : 1 }]}>
    <View style={[s.tile, { backgroundColor: active ? colors.accentSoft : colors.elevated }]}>
      <Icon name={active ? 'folder' : 'folder-outline'} size={22} color={active ? colors.accent : colors.text} />
    </View>
    <View style={s.text}>
      <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{project.name}</Text>
      <View style={s.detail}>
        <Icon name={project.branch ? 'git-branch-outline' : 'folder-open-outline'} size={12} color={colors.muted} />
        <Text numberOfLines={1} style={[s.detailText, { color: colors.muted }]}>{project.branch ?? project.path}</Text>
        {running > 0 && <Text numberOfLines={1} style={[s.running, { color: colors.success }]}>{`· ${running} running`}</Text>}
      </View>
    </View>
    {sessions.length > 0 && <View style={s.trail}>
      <TerminalStack sessions={sessions} />
      <Text style={[s.count, { color: colors.text }]}>{sessions.length}</Text>
    </View>}
    {onOptions
      ? <Pressable accessibilityRole="button" accessibilityLabel={`Options for ${project.name}`}
        onPress={onOptions} hitSlop={10} style={({ pressed }) => [s.options, { opacity: pressed ? 0.5 : 1 }]}>
        <Icon name="ellipsis-horizontal" size={18} color={colors.muted} />
      </Pressable>
      : <Icon name="chevron-forward" size={16} color={colors.muted} />}
  </Pressable>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13, minHeight: 72 },
  tile: { width: 46, height: 46, borderRadius: 46 / 3, alignItems: 'center', justifyContent: 'center' },
  options: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
  running: { fontSize: 13, lineHeight: 18, fontWeight: '500', flexShrink: 0 },
  trail: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 4 },
  count: { fontSize: 14, fontWeight: '600', minWidth: 10, textAlign: 'right' },
  window: { position: 'absolute', width: WIDTH, height: HEIGHT, borderRadius: 4, borderWidth: 1, padding: 4, gap: 2.5 },
  pixel: { width: 3.5, height: 3.5, borderRadius: 2 },
  line: { height: 1.5, width: 11, borderRadius: 1, opacity: 0.45 },
  short: { width: 7 },
});
