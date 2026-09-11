import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { computerAgents } from './agents';
import { sessionKindLabel } from './DrawerSessionList';
import { Icon } from './primitives';
import { useReducedMotion } from './useReducedMotion';
import type { IconName } from './primitives';
import type { Project, Session } from './types';

// The desktop column's row primitive at phone size: one monochrome icon, one
// name, one trailing slot. A project and the terminals inside it are the same
// row at two indents, so an opened project reads as one list continuing rather
// than a panel that grew out of the page.
const kindIcon = (session: Session): IconName =>
  computerAgents.find(agent => agent.kind === session.kind)?.icon ?? 'terminal-outline';
const stateName = (session: Session) =>
  session.status === 'running' ? 'Running' : session.status === 'interrupted' ? 'Stopped' : 'Exited';

function TerminalRow({ session, selected, onPress }: { session: Session; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  // State is the one trailing dot every row in this list uses. Exited is drawn as
  // an outline rather than another filled colour competing with what is running.
  const dot = session.status === 'running' ? { backgroundColor: colors.success }
    : session.status === 'interrupted' ? { backgroundColor: colors.warning }
      : { borderWidth: 1.5, borderColor: colors.border };
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }}
    accessibilityLabel={`${session.title}, ${sessionKindLabel(session)}, ${stateName(session)}`} onPress={onPress}
    style={({ pressed }) => [s.row, { backgroundColor: selected ? colors.accentSoft : pressed ? colors.elevated : 'transparent' }]}>
    {selected ? <View style={[s.edge, { backgroundColor: colors.accent }]} /> : null}
    <Icon name={kindIcon(session)} size={17} color={selected ? colors.accent : colors.muted} />
    <Text numberOfLines={1} style={[s.rowName, { color: colors.text }]}>{session.title}</Text>
    <View style={[s.dot, dot]} />
  </Pressable>;
}

function ActionRow({ icon, title, label, disabled, onPress }: {
  icon: IconName; title: string; label: string; disabled?: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} aria-disabled={disabled}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.row, { opacity: disabled ? 0.4 : 1, backgroundColor: pressed ? colors.elevated : 'transparent' }]}>
    <Icon name={icon} size={17} color={colors.muted} />
    <Text numberOfLines={1} style={[s.rowName, { color: colors.muted }]}>{title}</Text>
  </Pressable>;
}

export function ProjectRow({ project, sessions, open, connected, watching, selectedId, onToggle, onOpenSession, onNew, onFiles }: {
  project: Project; sessions: Session[]; open: boolean; connected: boolean; watching: boolean;
  selectedId: string | null;
  onToggle: () => void; onOpenSession: (id: string) => void; onNew: () => void; onFiles: () => void;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { turn.setValue(open ? 1 : 0); return; }
    const animation = Animated.timing(turn, { toValue: open ? 1 : 0, duration: 170,
      easing: Easing.out(Easing.quad), useNativeDriver: true });
    animation.start();
    return () => { animation.stop(); };
  }, [open, reduced, turn]);
  const running = sessions.filter(session => session.status === 'running').length;
  return <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={project.name} aria-expanded={open}
      accessibilityState={{ expanded: open }}
      accessibilityHint={open ? 'Hides the terminals in this project' : 'Shows the terminals in this project'}
      onPress={onToggle} style={({ pressed }) => [s.head, { backgroundColor: pressed ? colors.elevated : 'transparent' }]}>
      <Icon name="folder-outline" size={21} color={open ? colors.accent : colors.muted} />
      <View style={s.text}>
        <Text numberOfLines={1} style={[s.name, { color: colors.text }]}>{project.name}</Text>
        <View style={s.meta}>
          {project.branch ? <Icon name="git-branch-outline" size={11} color={colors.muted} /> : null}
          <Text numberOfLines={1} style={[s.metaText, { color: colors.muted }]}>{project.branch ?? project.path}</Text>
        </View>
      </View>
      {!open && running > 0 ? <View style={[s.dot, { backgroundColor: colors.success }]} /> : null}
      {!open && sessions.length > 0 ? <View style={[s.count, { backgroundColor: colors.elevated }]}>
        <Text style={[s.countText, { color: colors.muted }]}>{sessions.length}</Text>
      </View> : null}
      <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
        <Icon name="chevron-down" size={18} color={colors.muted} />
      </Animated.View>
    </Pressable>
    {open ? <View style={[s.body, { borderTopColor: colors.border }]}>
      {sessions.map(session => <TerminalRow key={session.id} session={session} selected={session.id === selectedId}
        onPress={() => onOpenSession(session.id)} />)}
      {sessions.length === 0 ? <Text style={[s.none, { color: colors.muted }]}>
        {watching ? 'No terminals open in this project on your computer.' : 'No terminals open yet.'}</Text> : null}
      {/* A computer this phone is only watching refuses both of these. Offering
          them anyway turned every tap into a server rejection. */}
      {watching ? null : <>
        <ActionRow icon="add" title="New terminal" label={`New chat in ${project.name}`}
          disabled={!connected} onPress={onNew} />
        <ActionRow icon="git-compare-outline" title="Files & changes" label={`Open ${project.name} files`}
          disabled={!connected} onPress={onFiles} />
      </>}
    </View> : null}
  </View>;
}
const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  head: { minHeight: 70, paddingHorizontal: 15, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 13 },
  text: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flex: 1, fontSize: 12 },
  count: { minWidth: 23, height: 21, borderRadius: 11, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12, fontWeight: '600' },
  body: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 7, gap: 1 },
  row: { minHeight: 46, paddingHorizontal: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  edge: { position: 'absolute', left: 0, top: 11, bottom: 11, width: 2, borderRadius: 1 },
  rowName: { flex: 1, fontSize: 14.5, fontWeight: '500', letterSpacing: -0.1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  none: { fontSize: 13, lineHeight: 19, paddingHorizontal: 8, paddingVertical: 9 },
});
