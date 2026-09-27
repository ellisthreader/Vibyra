import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { AgentMark } from './AgentRow';
import { agentName } from './agents';
import { sessionKindLabel, stateWords, terminalState } from './DrawerProjects';
import { canStartWork } from './mode';
import { Hint, Icon } from './primitives';
import { RailRow } from './RailRow';
import { SwipeToDeleteRow } from './SwipeToDeleteRow';
import { TreeRow } from './TreeRow';
import { useAction } from './useAction';
import type { Session, WorkspaceModel } from './types';

const canDelete = (session: Session, workspace: WorkspaceModel) =>
  !session.readOnly || canStartWork(workspace);

export function ProjectTerminalRow({
  session,
  workspace,
  onOpen,
  compact = false,
}: {
  compact?: boolean;
  session: Session;
  workspace: WorkspaceModel;
  onOpen(): void;
}) {
  const { colors } = useTheme();
  const { busy, error, run } = useAction();
  const latest = useRef(workspace);
  latest.current = workspace;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const state = terminalState(session, workspace);
  const remove = async () => {
    const hostId = workspace.host?.id;
    if (!mounted.current) return false;
    return run(async () => {
      const current = latest.current;
      const target = current.sessions.find((item) => item.id === session.id);
      if (
        current.host?.id !== hostId ||
        current.status !== 'connected' ||
        !target ||
        !canDelete(target, current)
      ) {
        throw new Error(
          'This terminal can no longer be deleted here. Refresh your connection and try again.',
        );
      }
      await current.actions.stopSession(target.id);
      if (
        mounted.current &&
        latest.current.host?.id === hostId &&
        latest.current.selectedSessionId === target.id
      )
        latest.current.actions.selectSession(null);
    });
  };
  if (compact)
    return (
      <View>
        <SwipeToDeleteRow enabled={canDelete(session, workspace) && workspace.status === 'connected' && !busy}
          label={`Delete terminal ${session.title}`} onDelete={remove} testID={`swipe-terminal-${session.id}`}>
          <TreeRow
            icon={session.kind === 'shell' ? 'terminal-outline' : 'code-slash-outline'}
            label={session.title}
            state={state}
            accessibilityLabel={`${session.title}, ${sessionKindLabel(session)}, ${stateWords(state)}`}
            selected={session.id === workspace.selectedSessionId}
            busy={busy}
            accessibilityHint={canDelete(session, workspace) ? 'Swipe left to delete this terminal.' : undefined}
            onPress={onOpen}
          />
        </SwipeToDeleteRow>
        {error && <Hint error>{error}</Hint>}
      </View>
    );
  return (
    <View>
      <View style={s.row}>
        <View style={s.open}>
          <RailRow
            mark={
              compact ? (
                <Icon
                  name={session.kind === 'shell' ? 'terminal-outline' : 'chatbubble-outline'}
                  size={17}
                  color={colors.muted}
                />
              ) : (
                <AgentMark kind={session.kind} size={30} />
              )
            }
            label={session.title}
            detail={compact ? undefined : `${agentName(session.kind)} · ${stateWords(state)}`}
            selected={session.id === workspace.selectedSessionId}
            state={state}
            accessibilityLabel={`${session.title}, ${sessionKindLabel(session)}, ${stateWords(state)}`}
            onPress={onOpen}
          />
        </View>
        {canDelete(session, workspace) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete terminal ${session.title}`}
            accessibilityHint="Removes this terminal from your workspace and stops its work."
            disabled={busy || workspace.status !== 'connected'}
            accessibilityState={{ disabled: busy || workspace.status !== 'connected', busy }}
            onPress={() => { void remove(); }}
            style={({ pressed }) => [
              s.delete,
              { opacity: busy || workspace.status !== 'connected' ? 0.4 : pressed ? 0.6 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.muted} />
            ) : (
              <Icon name="trash-outline" size={18} color={colors.muted} />
            )}
          </Pressable>
        )}
      </View>
      {error && <Hint error>{error}</Hint>}
    </View>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  open: { flex: 1, minWidth: 0 },
  delete: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
