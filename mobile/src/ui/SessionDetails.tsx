import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { sessionIcon } from './DrawerProjects';
import { canStartWork } from './mode';
import { Button, Icon } from './primitives';
import type { Project, Session, WorkspaceModel } from './types';

export function SessionDetails({ session, project, workspace, busy, onReview, onStop }: {
  session: Session; project?: Project; workspace: WorkspaceModel; busy: boolean; onReview: () => void; onStop: () => void;
}) {
  const { colors } = useTheme();
  const provider = session.kind === 'shell' ? 'Terminal' : session.kind === 'claude' ? 'Claude Code' : 'Codex';
  // A Host's session is always this phone's to stop; a Mac's only when its
  // typing switch is on, which is when it takes terminals down on request.
  const closable = !session.readOnly || canStartWork(workspace);
  return <ScrollView contentContainerStyle={s.content}>
    <View style={[s.providerIcon, { backgroundColor: colors.elevated }]}>
      <Icon name={sessionIcon(session)} size={25} />
    </View>
    <Text style={[s.title, { color: colors.text }]}>{session.title}</Text>
    <Text style={[s.subtitle, { color: colors.muted }]}>{provider} · {workspace.host?.name ?? 'Your computer'}</Text>
    <View style={[s.info, { borderColor: colors.border }]}>
      <View style={s.row}><Icon name="folder-outline" size={18} color={colors.muted} />
        <View style={s.value}><Text selectable style={[s.infoTitle, { color: colors.text }]}>{project?.name ?? 'Project'}</Text>
          <Text selectable style={[s.path, { color: colors.muted }]}>{project?.path ?? 'Project path unavailable'}</Text></View></View>
      {project?.branch && <View style={s.row}><Icon name="git-branch-outline" size={18} color={colors.muted} />
        <Text selectable style={[s.infoTitle, { color: colors.text }]}>{project.branch}</Text></View>}
      <View style={s.row}><Icon name="ellipse" size={9} color={session.status === 'running' ? colors.success : colors.muted} />
        <Text style={[s.infoTitle, { color: colors.text }]}>{session.status === 'running'
          ? workspace.demo ? 'Running · sample session' : 'Running on your computer'
          : session.status === 'interrupted' ? 'Interrupted' : 'Finished'}</Text></View>
    </View>
    {!session.readOnly && <Button title="Review files and changes" icon="git-compare-outline" secondary onPress={onReview} disabled={workspace.status !== 'connected'} />}
    <Text style={[s.note, { color: colors.muted }]}>{session.readOnly && session.runner === 'conversation' ? `This chat is shared with Vibyra Desktop. Messages and agent requests stay in sync. ${closable ? 'Close it here or on your Mac; review files on your computer.' : 'Start or end chats and review files on your computer.'}` : session.readOnly ? session.canInput === true
      ? `This is the live terminal from Vibyra Desktop. Take control to type into it; ${closable ? 'close it here or on your Mac, and review files on your computer.' : 'use your Mac to stop sessions or review files.'}`
      : 'This is the live terminal from Vibyra Desktop. Use your Mac to send commands, stop sessions or review files.' : workspace.demo ? 'Sample workspace. No computer is connected.'
      : session.kind === 'shell' ? 'Commands run in your computer’s shell with access to its files and installed tools.'
        : session.runner === 'conversation' ? `${provider} runs on your computer. Tap an activity in the conversation to inspect commands and output. Questions and permissions appear inline when your response is needed.`
        : `${provider} runs on your computer. Its live terminal includes any permission requests that need your response.`}</Text>
    {closable && session.status === 'running' && <Button title="Stop session" danger icon="stop-circle-outline" busy={busy}
      disabled={workspace.status !== 'connected'} onPress={onStop} />}
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { padding: 24, paddingTop: 28, paddingBottom: 36, gap: 16 },
  providerIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 25, fontWeight: '600', letterSpacing: -0.8, lineHeight: 32 },
  subtitle: { fontSize: 13, marginTop: -8 }, info: { borderWidth: StyleSheet.hairlineWidth, padding: 19, borderRadius: 20, gap: 22, marginVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13 }, value: { flex: 1, gap: 5 },
  infoTitle: { fontSize: 14, fontWeight: '500', flexShrink: 1 }, path: { fontSize: 12, lineHeight: 19, flexShrink: 1 },
  note: { fontSize: 13, lineHeight: 21, paddingHorizontal: 2 },
});
