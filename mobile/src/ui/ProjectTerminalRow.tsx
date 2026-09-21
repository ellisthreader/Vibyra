import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { AgentMark } from './AgentRow';
import { agentName } from './agents';
import { confirmAction } from './confirm';
import { sessionKindLabel, stateWords, terminalState } from './DrawerProjects';
import { canStartWork } from './mode';
import { Hint, Icon } from './primitives';
import { RailRow } from './RailRow';
import { useAction } from './useAction';
import type { Session, WorkspaceModel } from './types';

const canClose = (session: Session, workspace: WorkspaceModel) => session.status === 'running'
  && (!session.readOnly || canStartWork(workspace));

export function ProjectTerminalRow({ session, workspace, onOpen, compact = false }: {
  compact?: boolean; session: Session; workspace: WorkspaceModel; onOpen(): void;
}) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const latest = useRef(workspace); latest.current = workspace;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const state = terminalState(session, workspace);
  const close = () => {
    const hostId = workspace.host?.id;
    confirmAction(`Close “${session.title}”?`, workspace.demo
      ? 'This closes the sample terminal. No computer process is affected.'
      : 'This stops the terminal and any work running in it on your computer. Saved files remain.',
    'Close terminal', () => { if (!mounted.current) return; void run(async () => {
      const current = latest.current;
      const target = current.sessions.find(item => item.id === session.id);
      if (current.host?.id !== hostId || current.status !== 'connected' || !target || !canClose(target, current)) {
        throw new Error('This terminal can no longer be closed here. Refresh your connection and try again.');
      }
      await current.actions.stopSession(target.id);
      if (mounted.current && latest.current.host?.id === hostId && latest.current.selectedSessionId === target.id) latest.current.actions.selectSession(null);
    }); });
  };
  if (compact) return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${session.title}, ${sessionKindLabel(session)}, ${stateWords(state)}`}
      aria-selected={session.id === workspace.selectedSessionId} accessibilityState={{ selected: session.id === workspace.selectedSessionId, busy }}
      accessibilityHint={canClose(session, workspace) ? 'Hold to close this terminal with confirmation.' : undefined}
      onPress={onOpen} onLongPress={canClose(session, workspace) && workspace.status === 'connected' && !busy ? close : undefined}
      style={({ pressed }) => [s.compact, { backgroundColor: pressed ? colors.elevated : 'transparent' }]}>
      <View style={[s.dot, { backgroundColor: state === 'running' ? colors.success : state === 'input' ? colors.warning : state === 'stopped' ? colors.error : colors.muted }]} />
      <Text numberOfLines={1} style={[s.compactLabel, { color: session.id === workspace.selectedSessionId ? colors.text : colors.muted }]}>{session.title}</Text>
    </Pressable>{error && <Hint error>{error}</Hint>}
  </View>;
  return <View>
    <View style={s.row}>
      <View style={s.open}><RailRow mark={compact ? <Icon name={session.kind === 'shell' ? 'terminal-outline' : 'chatbubble-outline'} size={17} color={colors.muted} /> : <AgentMark kind={session.kind} size={30} />} label={session.title}
        detail={compact ? undefined : `${agentName(session.kind)} · ${stateWords(state)}`}
        selected={session.id === workspace.selectedSessionId} state={state}
        accessibilityLabel={`${session.title}, ${sessionKindLabel(session)}, ${stateWords(state)}`} onPress={onOpen} /></View>
      {canClose(session, workspace) && <Pressable accessibilityRole="button" accessibilityLabel={`Close terminal ${session.title}`}
        accessibilityHint="Stops this terminal on your computer after confirmation."
        disabled={busy || workspace.status !== 'connected'} accessibilityState={{ disabled: busy || workspace.status !== 'connected', busy }}
        onPress={close} style={({ pressed }) => [s.close, { opacity: busy || workspace.status !== 'connected' ? 0.4 : pressed ? 0.6 : 1 }]}>
        {busy ? <ActivityIndicator size="small" color={colors.muted} /> : <Icon name="close" size={18} color={colors.muted} />}
      </Pressable>}
    </View>
    {error && <Hint error>{error}</Hint>}
  </View>;
}
const s = StyleSheet.create({
  compact: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 12, borderRadius: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  compactLabel: { flex: 1, fontFamily: 'DM Sans', fontSize: 17, fontWeight: '400' },
  row: { flexDirection: 'row', alignItems: 'center' },
  open: { flex: 1, minWidth: 0 }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } });
