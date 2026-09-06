import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandMark, Button, EmptyState, Hint, Icon, SectionLabel } from './primitives';
import { useAction } from './useAction';
import type { Session, WorkspaceModel } from './types';

export function WorkScreen({ workspace, onConnect, onNew }: {
  workspace: WorkspaceModel; onConnect: () => void; onNew: () => void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const { busy, error, run } = useAction();
  const connected = workspace.status === 'connected';
  const sessions = workspace.sessions.filter(item => item.title.toLowerCase().includes(query.toLowerCase()));
  if (!workspace.host && workspace.sessions.length === 0) return <ScrollView contentContainerStyle={s.welcome}>
    <View style={s.hero}><BrandMark size={51} />
      <Text accessibilityRole="header" style={[s.headline, { color: colors.text }]}>A little idea.{'\n'}A world of possibility.</Text>
      <Text style={[s.intro, { color: colors.muted }]}>Your coding workspace, wherever you are.</Text>
    </View>
    <View style={[s.promise, { backgroundColor: colors.surface }]}>
      <View style={s.promiseRow}><Icon name="desktop-outline" size={22} /><Text style={[s.promiseTitle, { color: colors.text }]}>Powered by your computer</Text></View>
      <Text style={[s.promiseDetail, { color: colors.muted }]}>Code, terminals, and builds run on your machine. Your phone keeps you connected.</Text>
    </View>
    <Button title="Connect your computer" icon="add" onPress={onConnect} />
    <View style={s.private}><Icon name="lock-closed-outline" size={13} color={colors.muted} />
      <Text style={[s.privateText, { color: colors.muted }]}>Your projects. Your hardware. Your control.</Text></View>
  </ScrollView>;
  return <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
    refreshControl={<RefreshControl refreshing={busy} tintColor={colors.accent}
      onRefresh={() => void run(workspace.actions.refresh)} enabled={connected} />}>
    <View style={s.titleRow}><Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>Your work</Text>
      <Pressable accessibilityRole="button" onPress={onNew} disabled={!connected}
        style={[s.new, { backgroundColor: colors.elevated, opacity: connected ? 1 : 0.4 }]}>
        <Icon name="add" size={19} /><Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>New</Text>
      </Pressable></View>
    {!connected && <View style={[s.offline, { backgroundColor: colors.surface }]}>
      <Hint>Your computer is disconnected. Reconnect to continue your work.</Hint>
      <Button title="Reconnect" secondary onPress={onConnect} />
    </View>}
    {(error || workspace.error) && <Hint error>{error || workspace.error}</Hint>}
    {workspace.approvals.length > 0 && <>
      <SectionLabel>Needs your attention</SectionLabel>
      {workspace.approvals.map(approval => <View key={approval.id} style={[s.approval, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Icon name="hand-left-outline" color={colors.warning} /><Text style={[s.approvalTitle, { color: colors.text }]}>{approval.title}</Text>
        <Text selectable style={[s.approvalDetail, { color: colors.muted }]}>{approval.detail}</Text>
        {workspace.actions.resolveApproval && <View style={s.approvalActions}>
          <Button title="Deny" secondary busy={busy} onPress={() => void run(() => workspace.actions.resolveApproval!(approval.id, false))} />
          <Button title="Approve" busy={busy} onPress={() => void run(() => workspace.actions.resolveApproval!(approval.id, true))} />
        </View>}
      </View>)}
    </>}
    {workspace.sessions.length > 4 && <View style={[s.search, { backgroundColor: colors.surface }]}>
      <Icon name="search" size={19} color={colors.muted} /><TextInput value={query} onChangeText={setQuery}
        accessibilityLabel="Search your work" placeholder="Search your work" placeholderTextColor={colors.muted}
        style={[s.searchInput, { color: colors.text }]} /></View>}
    {sessions.length === 0 ? <EmptyState icon="chatbubble-ellipses-outline" title={query ? 'No matching work' : 'What will you build?'}
      detail={query ? 'Try another search.' : 'Start a coding agent or open a terminal in one of your projects.'}>
      {!query && connected && <Button title="Start new work" onPress={onNew} />}
    </EmptyState> : <><SectionLabel>Sessions</SectionLabel>{sessions.map(session => <SessionRow key={session.id} session={session}
      projectName={workspace.projects.find(project => project.id === session.projectId)?.name ?? 'Project'}
      onPress={() => workspace.actions.selectSession(session.id)} />)}</>}
  </ScrollView>;
}
function SessionRow({ session, projectName, onPress }: { session: Session; projectName: string; onPress: () => void }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${session.title}, ${projectName}, ${session.status}`}
    onPress={onPress} style={[s.session, { borderBottomColor: colors.border }]}>
    <View style={[s.sessionIcon, { backgroundColor: colors.elevated }]}><Icon name={session.kind === 'shell' ? 'terminal-outline' : 'sparkles-outline'} size={20} /></View>
    <View style={s.sessionText}><Text numberOfLines={2} style={[s.sessionTitle, { color: colors.text }]}>{session.title}</Text>
      <Text numberOfLines={1} style={[s.sessionMeta, { color: colors.muted }]}>{projectName} · {session.kind === 'shell' ? 'Terminal' : session.kind === 'codex' ? 'Codex' : 'Claude'}</Text></View>
    {session.status === 'running' ? <View accessibilityLabel="Running" style={[s.dot, { backgroundColor: colors.success }]} /> :
      <Icon name={session.status === 'exited' && session.exitCode === 0 ? 'checkmark' : 'alert-circle-outline'} size={16}
        color={session.exitCode && session.exitCode !== 0 ? colors.error : colors.muted} />}
    <Icon name="chevron-forward" size={15} color={colors.muted} />
  </Pressable>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 },
  welcome: { flexGrow: 1, paddingHorizontal: 26, paddingBottom: 28, justifyContent: 'flex-end', gap: 20 },
  hero: { flex: 1, minHeight: 310, justifyContent: 'center', alignItems: 'center', paddingVertical: 46, gap: 28 },
  headline: { fontSize: 34, fontWeight: '600', lineHeight: 42, letterSpacing: -1.1, textAlign: 'center' },
  intro: { fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 280, marginTop: -13 },
  promise: { padding: 20, borderRadius: 22, gap: 10 }, promiseRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  promiseTitle: { flex: 1, fontSize: 16, fontWeight: '600' }, promiseDetail: { fontSize: 14, lineHeight: 21 },
  private: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, privateText: { fontSize: 11, flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontSize: 29, fontWeight: '600', letterSpacing: -0.8 }, new: { minHeight: 44,
    paddingHorizontal: 15, flexDirection: 'row', gap: 5, alignItems: 'center', borderRadius: 22 },
  offline: { padding: 18, borderRadius: 18, gap: 14, marginTop: 22 },
  approval: { borderWidth: 1, padding: 18, borderRadius: 18, gap: 12, marginBottom: 12 },
  approvalTitle: { fontSize: 17, fontWeight: '600' }, approvalDetail: { fontSize: 14, lineHeight: 21 },
  approvalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  search: { marginTop: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: 15, gap: 9 },
  searchInput: { flex: 1, fontSize: 16, minHeight: 46 },
  session: { minHeight: 89, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  sessionIcon: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sessionText: { flex: 1, gap: 6 }, sessionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '500' },
  sessionMeta: { fontSize: 12 }, dot: { height: 6, width: 6, borderRadius: 3 },
});
