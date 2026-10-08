import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { sessionIcon } from './DrawerProjects';
import { canStartWork } from './mode';
import { Button, Icon } from './primitives';
import type { Project, Session, WorkspaceModel } from './types';

export function SessionDetails({
  session,
  project,
  workspace,
  busy,
  onReview,
  onStop,
}: {
  session: Session;
  project?: Project;
  workspace: WorkspaceModel;
  busy: boolean;
  onReview: () => void;
  onStop: () => void;
}) {
  const { colors } = useTheme();
  const provider =
    session.kind === 'shell' ? 'Terminal' : session.kind === 'claude' ? 'Claude Code' : 'Codex';
  // A Host's session is always this phone's to stop; a Mac's only when its
  // typing switch is on, which is when it takes terminals down on request.
  const closable = !session.readOnly || canStartWork(workspace);
  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={[s.providerIcon, { backgroundColor: colors.elevated }]}>
        <Icon name={sessionIcon(session)} size={24} />
      </View>
      <Text style={[s.title, { color: colors.text }]}>{session.title}</Text>
      <Text style={[s.subtitle, { color: colors.muted }]}>
        {provider} · {workspace.host?.name ?? 'Your computer'}
      </Text>
      <View style={[s.info, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={s.row}>
          <View style={s.glyph}>
            <Icon name="folder-outline" size={18} color={colors.muted} />
          </View>
          <View style={s.value}>
            <Text selectable style={[s.infoTitle, { color: colors.text }]}>
              {project?.name ?? 'Project'}
            </Text>
            <Text selectable style={[s.path, { color: colors.muted }]}>
              {project?.path ?? 'Project path unavailable'}
            </Text>
          </View>
        </View>
        {project?.branch && (
          <View style={[s.row, s.ruled, { borderTopColor: colors.border }]}>
            <View style={s.glyph}>
              <Icon name="git-branch-outline" size={18} color={colors.muted} />
            </View>
            <Text selectable style={[s.infoTitle, s.mono, { color: colors.text }]}>
              {project.branch}
            </Text>
          </View>
        )}
        <View style={[s.row, s.ruled, { borderTopColor: colors.border }]}>
          <View style={s.glyph}>
            <View
              style={[
                s.state,
                { backgroundColor: session.status === 'running' ? colors.success : colors.muted },
              ]}
            />
          </View>
          <Text style={[s.infoTitle, { color: colors.text }]}>
            {session.status === 'running'
              ? workspace.demo
                ? 'Running · sample session'
                : 'Running on your computer'
              : session.status === 'interrupted'
                ? 'Interrupted'
                : 'Finished'}
          </Text>
        </View>
      </View>
      {!session.readOnly && (
        <Button
          title="Review files and changes"
          icon="git-compare-outline"
          secondary
          onPress={onReview}
          disabled={workspace.status !== 'connected'}
        />
      )}
      <Text style={[s.note, { color: colors.muted }]}>
        {session.readOnly && session.runner === 'conversation'
          ? `This chat is shared with Vibyra Desktop. Messages and agent requests stay in sync. ${closable ? 'Close it here or on your Mac; review files on your computer.' : 'Start or end chats and review files on your computer.'}`
          : session.readOnly
            ? session.canInput === true
              ? `This is the live terminal from Vibyra Desktop. Take control to type into it; ${closable ? 'close it here or on your Mac, and review files on your computer.' : 'use your Mac to stop sessions or review files.'}`
              : 'This is the live terminal from Vibyra Desktop. Use your Mac to send commands, stop sessions or review files.'
            : workspace.demo
              ? 'Sample workspace. No computer is connected.'
              : session.kind === 'shell'
                ? 'Commands run in your computer’s shell with access to its files and installed tools.'
                : session.runner === 'conversation'
                  ? `${provider} runs on your computer. Tap an activity in the conversation to inspect commands and output. Questions and permissions appear inline when your response is needed.`
                  : `${provider} runs on your computer. Its live terminal includes any permission requests that need your response.`}
      </Text>
      {closable && session.status === 'running' && (
        <Button
          title="Stop session"
          danger
          icon="stop-circle-outline"
          busy={busy}
          disabled={workspace.status !== 'connected'}
          onPress={onStop}
        />
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, gap: 14 },
  providerIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.6, lineHeight: 30 },
  subtitle: { fontSize: 14, letterSpacing: -0.1, marginTop: -10 },
  info: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    marginVertical: 6,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth },
  glyph: { width: 20, alignItems: 'center' },
  state: { width: 8, height: 8, borderRadius: 4 },
  value: { flex: 1, gap: 2 },
  infoTitle: { fontSize: 15, fontWeight: '500', letterSpacing: -0.2, flexShrink: 1 },
  path: { fontSize: 13, lineHeight: 18, flexShrink: 1 },
  mono: { fontFamily: 'Menlo', fontSize: 13.5 },
  note: { fontSize: 13, lineHeight: 19, letterSpacing: -0.05, paddingHorizontal: 4 },
});
