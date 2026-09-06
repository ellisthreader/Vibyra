import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TerminalSurface } from '../terminal/TerminalSurface';
import { useTheme } from '../theme';
import { Composer } from './Composer';
import { Button, Hint, Icon, SectionLabel } from './primitives';
import { ReviewSheet } from './ReviewSheet';
import { useAction } from './useAction';
import { useDraft } from './useDraft';
import type { Session, WorkspaceModel } from './types';

export function SessionScreen({ session, workspace }: { session: Session; workspace: WorkspaceModel }) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<'terminal' | 'details'>('terminal');
  const [review, setReview] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [draft, setDraft] = useDraft(`${workspace.host?.id}:${session.projectId}:${session.id}`);
  const { busy, error, run } = useAction();
  const project = workspace.projects.find(item => item.id === session.projectId);
  const canInput = workspace.status === 'connected' && session.status === 'running';
  const provider = session.kind === 'shell' ? 'Terminal' : session.kind === 'claude' ? 'Claude Code' : 'Codex';
  const stop = () => Alert.alert('Stop this session?', 'The process running on your computer will be stopped. Saved files will remain.', [
    { text: 'Keep running', style: 'cancel' },
    { text: 'Stop session', style: 'destructive', onPress: () => void run(() => workspace.actions.stopSession(session.id)) },
  ]);
  return <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
    <View style={[s.context, { borderBottomColor: colors.border }]}>
      <Icon name="folder-outline" size={15} color={colors.muted} />
      <Text numberOfLines={1} style={[s.contextText, { color: colors.muted }]}>{project?.name ?? 'Project'} · {workspace.host?.name ?? 'Computer'}</Text>
      <View accessibilityLabel={canInput ? 'Running and connected' : session.status} style={[s.dot,
        { backgroundColor: canInput ? colors.success : colors.muted }]} />
    </View>
    <View style={s.tabBar}>{(['terminal', 'details'] as const).map(item => <Pressable key={item}
      accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)}
      style={[s.tab, { backgroundColor: tab === item ? colors.elevated : 'transparent' }]}>
      <Text style={[s.tabText, { color: tab === item ? colors.text : colors.muted }]}>{item === 'terminal' ? 'Terminal' : 'Details'}</Text>
    </Pressable>)}</View>
    {workspace.status !== 'connected' && <View style={[s.status, { backgroundColor: colors.elevated }]}>
      <Hint>Disconnected. Your computer may still be working. Reconnect to see its current state.</Hint></View>}
    {session.status !== 'running' && <View style={s.status}><Hint>{session.status === 'interrupted'
      ? 'This session was interrupted. Start a new session to continue.'
      : `This process exited${session.exitCode === undefined ? '.' : ` with code ${session.exitCode}.`}`}</Hint></View>}
    {(error || inputError) && <View style={s.status}><Hint error>{error || inputError}</Hint></View>}
    {tab === 'terminal' ? <View style={[s.terminal, { backgroundColor: colors.workspace }]}>
      <TerminalSurface output={workspace.output} onInput={(data: string) => {
        void workspace.actions.sendInput(data).catch(cause => setInputError(cause instanceof Error ? cause.message : 'Input could not be sent.'));
      }}
        onResize={(cols: number, rows: number) => {
          void Promise.resolve(workspace.actions.resize(cols, rows)).catch(cause =>
            setInputError(cause instanceof Error ? cause.message : 'Terminal size could not be updated.'));
        }} disabled={!canInput} />
    </View> : <ScrollView contentContainerStyle={s.details}>
      <View style={s.provider}><Icon name={session.kind === 'shell' ? 'terminal-outline' : 'sparkles-outline'} size={27} />
        <Text style={[s.providerTitle, { color: colors.text }]}>{provider}</Text></View>
      <Text style={[s.explanation, { color: colors.muted }]}>{session.kind === 'shell'
        ? 'A live terminal on your computer. Commands use that computer’s shell, files, and installed tools.'
        : `${provider} runs in your computer’s terminal, using its installed tools and provider account. Read and respond to permission prompts in Terminal.`}</Text>
      <SectionLabel>Workspace</SectionLabel>
      <View style={[s.info, { backgroundColor: colors.surface }]}>
        <Text selectable style={[s.infoTitle, { color: colors.text }]}>{project?.name ?? 'Project'}</Text>
        <Text selectable style={[s.path, { color: colors.muted }]}>{project?.path ?? 'Project path unavailable'}</Text>
        {project?.branch && <Text style={[s.path, { color: colors.muted }]}>Branch: {project.branch}</Text>}
      </View>
      <Button title="Review files and changes" icon="git-compare-outline" secondary onPress={() => setReview(true)}
        disabled={workspace.status !== 'connected'} />
      <Hint>Changes are read from the project on your computer. Other sessions may also be working in this folder.</Hint>
      {session.status === 'running' && <Button title="Stop session" danger icon="stop-circle-outline" busy={busy} disabled={!canInput} onPress={stop} />}
    </ScrollView>}
    {tab === 'terminal' && <Composer value={draft} onChange={setDraft} disabled={!canInput}
      shell={session.kind === 'shell'} onSend={value => run(() => workspace.actions.sendInput(`${value}\r`))} />}
    <ReviewSheet visible={review} onClose={() => setReview(false)} project={project} workspace={workspace} />
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  body: { flex: 1 }, context: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 23, paddingVertical: 12,
    gap: 8, borderBottomWidth: StyleSheet.hairlineWidth }, contextText: { fontSize: 12, flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 }, tabBar: { flexDirection: 'row', gap: 5, paddingHorizontal: 15, paddingVertical: 9 },
  tab: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center' }, tabText: { fontSize: 14, fontWeight: '500' },
  terminal: { flex: 1, minHeight: 130 }, status: { paddingHorizontal: 22, paddingVertical: 10 },
  details: { padding: 24, gap: 18, paddingBottom: 32 }, provider: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  providerTitle: { fontSize: 26, fontWeight: '600', letterSpacing: -0.5 }, explanation: { fontSize: 16, lineHeight: 25 },
  info: { padding: 19, borderRadius: 19, gap: 8 }, infoTitle: { fontSize: 17, fontWeight: '500' }, path: { fontSize: 13, lineHeight: 21 },
});
