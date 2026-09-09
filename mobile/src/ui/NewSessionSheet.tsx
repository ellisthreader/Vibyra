import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, EmptyState, Hint, Icon } from './primitives';
import { Sheet } from './Sheet';
import { useAction } from './useAction';
import { computerAgents as kinds } from './agents';
import type { SessionKind, WorkspaceModel } from './types';

// Reached only from the Projects list, where picking the folder is the point.
// The home composer sends without ever opening this sheet.
export function NewSessionSheet({ visible, workspace, initialProjectId, initialKind = 'claude', onClose }: {
  visible: boolean; workspace: WorkspaceModel; initialProjectId?: string; initialKind?: SessionKind; onClose: () => void;
}) {
  const { colors } = useTheme();
  const [projectId, setProjectId] = useState(initialProjectId ?? '');
  const [kind, setKind] = useState<SessionKind>(initialKind);
  const [title, setTitle] = useState('');
  const { busy, error, run } = useAction();
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setProjectId(initialProjectId ?? (workspace.projects.length === 1 ? workspace.projects[0]!.id : ''));
      setKind(initialKind);
    }
    wasVisible.current = visible;
  }, [visible, initialProjectId, initialKind, workspace.projects]);
  const create = async () => {
    const name = title.trim() || `${kinds.find(item => item.kind === kind)!.name} ${kind === 'shell' ? 'terminal' : 'chat'}`;
    if (await run(() => workspace.actions.createSession(projectId, kind, name))) { setTitle(''); onClose(); }
  };
  return <Sheet visible={visible} title="New chat" onClose={onClose}>
    {workspace.projects.length === 0 ? <EmptyState icon="folder-outline" title="No shared projects"
      detail="Add a project folder in Vibyra Host on your computer, then refresh Projects." /> : <>
      <View style={s.host}><Icon name="desktop-outline" size={15} color={colors.muted} />
        <Text numberOfLines={1} style={[s.hostText, { color: colors.muted }]}>{workspace.host?.name ?? 'Your computer'}</Text></View>
      <Text style={[s.section, { color: colors.text }]}>Project</Text>
      <View style={[s.projects, { borderColor: colors.border }]}>{workspace.projects.map((project, index) =>
        <Pressable key={project.id} accessibilityRole="radio" accessibilityLabel={project.name}
          aria-checked={projectId === project.id} aria-disabled={busy} accessibilityState={{ checked: projectId === project.id, disabled: busy }} disabled={busy}
          onPress={() => setProjectId(project.id)} style={[s.project, { borderTopColor: colors.border,
            borderTopWidth: index ? StyleSheet.hairlineWidth : 0 }]}>
          <Icon name="folder-outline" size={20} color={colors.muted} /><View style={s.projectText}>
            <Text style={[s.projectName, { color: colors.text }]}>{project.name}</Text>
            <Text numberOfLines={1} style={[s.path, { color: colors.muted }]}>{project.path}</Text>
          </View><Icon name={projectId === project.id ? 'checkmark-circle' : 'ellipse-outline'} size={21}
            color={projectId === project.id ? colors.accent : colors.border} />
        </Pressable>)}</View>
      <Text style={[s.section, { color: colors.text }]}>Open with</Text>
      <View style={s.kinds}>{kinds.map(item => <Pressable key={item.kind} accessibilityRole="radio"
        accessibilityLabel={item.name} aria-checked={kind === item.kind} aria-disabled={busy} accessibilityState={{ checked: kind === item.kind, disabled: busy }}
        disabled={busy} onPress={() => setKind(item.kind)} style={[s.kind, { borderColor: kind === item.kind ? colors.text : colors.border,
          backgroundColor: kind === item.kind ? colors.elevated : 'transparent' }]}>
        <Icon name={item.icon} size={22} color={kind === item.kind ? colors.text : colors.muted} />
        <Text style={[s.kindText, { color: colors.text }]}>{item.short}</Text>
      </Pressable>)}</View>
      <TextInput value={title} onChangeText={setTitle} placeholder={kind === 'shell' ? 'Terminal name (optional)' : 'Chat name (optional)'}
        placeholderTextColor={colors.muted} accessibilityLabel="Session name" maxLength={120} editable={!busy}
        style={[s.input, { color: colors.text, borderColor: colors.border }]} />
      {error && <Hint error>{error}</Hint>}
      <Button title={kind === 'shell' ? 'Open terminal' : 'Create chat'} icon="arrow-forward" busy={busy}
        disabled={!workspace.projects.some(project => project.id === projectId) || workspace.status !== 'connected'} onPress={() => void create()} />
      <Text style={[s.note, { color: colors.muted }]}>{workspace.demo ? 'Sample workspace. No commands are sent.'
        : kind === 'shell' ? 'Uses the shell and permissions on your computer.' : 'Uses the tools and provider account on your computer.'}</Text>
    </>}
  </Sheet>;
}
const s = StyleSheet.create({
  host: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 }, hostText: { flex: 1, fontSize: 12 },
  section: { fontSize: 14, fontWeight: '500', marginTop: 4, marginBottom: -6 },
  projects: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden' },
  project: { minHeight: 66, paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  projectText: { flex: 1, gap: 5 }, projectName: { fontSize: 15, fontWeight: '500' }, path: { fontSize: 12 },
  kinds: { flexDirection: 'row', gap: 10 }, kind: { flex: 1, minHeight: 83, paddingHorizontal: 8, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', gap: 11, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  kindText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  input: { minHeight: 53, fontSize: 15, borderRadius: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  note: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: -3 },
});
