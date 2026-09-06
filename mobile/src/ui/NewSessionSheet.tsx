import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, EmptyState, Hint, Icon, SectionLabel, type IconName } from './primitives';
import { Sheet } from './Sheet';
import { useAction } from './useAction';
import type { SessionKind, WorkspaceModel } from './types';

const kinds: { id: SessionKind; label: string; detail: string; icon: IconName }[] = [
  { id: 'claude', label: 'Claude Code', detail: 'Use Claude on your computer', icon: 'sparkles-outline' },
  { id: 'codex', label: 'Codex', detail: 'Use Codex on your computer', icon: 'code-slash-outline' },
  { id: 'shell', label: 'Terminal', detail: 'Open your computer’s shell', icon: 'terminal-outline' },
];
export function NewSessionSheet({ visible, workspace, initialProjectId, onClose }: {
  visible: boolean; workspace: WorkspaceModel; initialProjectId?: string; onClose: () => void;
}) {
  const { colors } = useTheme();
  const [projectId, setProjectId] = useState(initialProjectId ?? '');
  const [kind, setKind] = useState<SessionKind>('claude');
  const [title, setTitle] = useState('');
  const { busy, error, run } = useAction();
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) setProjectId(initialProjectId ?? (workspace.projects.length === 1 ? workspace.projects[0]!.id : ''));
    wasVisible.current = visible;
  }, [visible, initialProjectId, workspace.projects]);
  const create = async () => {
    const name = title.trim() || `${kinds.find(item => item.id === kind)!.label} session`;
    if (await run(() => workspace.actions.createSession(projectId, kind, name))) { setTitle(''); onClose(); }
  };
  return <Sheet visible={visible} title="Start new work" onClose={onClose}>
    {workspace.projects.length === 0 ? <EmptyState icon="folder-outline" title="Add a project first"
      detail="Choose a project folder in Vibyra Host on your computer, then refresh the Projects page." /> : <>
      <SectionLabel>Project</SectionLabel>
      <View style={[s.group, { backgroundColor: colors.surface }]}>{workspace.projects.map(project =>
        <Pressable key={project.id} accessibilityRole="radio" accessibilityState={{ selected: projectId === project.id }}
          onPress={() => setProjectId(project.id)} style={[s.row, { borderBottomColor: colors.border }]}>
          <Icon name="folder-outline" size={21} color={colors.muted} /><View style={s.rowText}>
            <Text style={[s.label, { color: colors.text }]}>{project.name}</Text>
            <Text numberOfLines={1} style={[s.detail, { color: colors.muted }]}>{project.path}</Text>
          </View><Icon name={projectId === project.id ? 'checkmark-circle' : 'ellipse-outline'} size={23}
            color={projectId === project.id ? colors.accent : colors.border} />
        </Pressable>)}</View>
      <SectionLabel>Work with</SectionLabel>
      <View style={[s.group, { backgroundColor: colors.surface }]}>{kinds.map(item =>
        <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: kind === item.id }}
          onPress={() => setKind(item.id)} style={[s.row, { borderBottomColor: colors.border }]}>
          <Icon name={item.icon} size={23} /><View style={s.rowText}>
            <Text style={[s.label, { color: colors.text }]}>{item.label}</Text>
            <Text style={[s.detail, { color: colors.muted }]}>{item.detail}</Text>
          </View><Icon name={kind === item.id ? 'checkmark-circle' : 'ellipse-outline'} size={23}
            color={kind === item.id ? colors.accent : colors.border} />
        </Pressable>)}</View>
      <Hint>Coding agents use the tools and sign-in already configured on your computer. Provider charges apply to your provider account.</Hint>
      <SectionLabel>Session name · optional</SectionLabel>
      <TextInput value={title} onChangeText={setTitle} placeholder="What are you working on?" placeholderTextColor={colors.muted}
        accessibilityLabel="Session name" maxLength={120} style={[s.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} />
      {error && <Hint error>{error}</Hint>}
      <Button title="Start session" icon="arrow-forward" busy={busy} disabled={!projectId || workspace.status !== 'connected'} onPress={() => void create()} />
    </>}
  </Sheet>;
}
const s = StyleSheet.create({
  group: { borderRadius: 18, overflow: 'hidden' }, row: { padding: 16, minHeight: 73, flexDirection: 'row',
    alignItems: 'center', gap: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, gap: 5 }, label: { fontSize: 16, fontWeight: '500' }, detail: { fontSize: 12, lineHeight: 18 },
  input: { minHeight: 54, fontSize: 16, borderRadius: 16, padding: 16, borderWidth: 1 },
});
