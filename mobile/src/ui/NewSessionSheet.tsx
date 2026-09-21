import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { useVibesStore } from '../vibes/VibesProvider';
import { AgentMark, AgentRow } from './AgentRow';
import { agentName, computerAgents } from './agents';
import { PhoneAgents } from './PhoneAgents';
import { EmptyState, Hint, Icon } from './primitives';
import { PickerSheet } from './ModelPickerSheet';
import { useAction } from './useAction';
import type { SessionKind, WorkspaceModel } from './types';

/** One line under each computer agent, said under the heading that already names the computer. */
const detail: Record<SessionKind, string> = {
  claude: 'Code with Claude', codex: 'Code with OpenAI', shell: 'Run commands yourself',
};

/**
 * The project is already settled in the sidebar. Computer runners are the
 * primary path; the phone catalogue is a secondary disclosure. Every runner
 * still starts directly, using the optional name above it.
 */
export function NewSessionSheet({ visible, workspace, initialProjectId, onClose, onOpenChat }: {
  visible: boolean; workspace: WorkspaceModel; initialProjectId?: string; onClose: () => void;
  /** Shows the AI chat once a phone-run agent has started; absent when the phone has none. */
  onOpenChat?: () => void;
}) {
  const { colors } = useTheme();
  const vibes = useVibesStore();
  const [title, setTitle] = useState('');
  const [starting, setStarting] = useState<SessionKind | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const { busy, error, run, clearError } = useAction();
  useEffect(() => { if (visible) { setTitle(''); clearError(); } }, [visible]);
  const project = workspace.projects.find(item => item.id === initialProjectId)
    ?? (workspace.projects.length === 1 ? workspace.projects[0] : undefined);
  const connected = workspace.status === 'connected';
  const create = async (kind: SessionKind) => {
    if (!project || busy || phoneBusy || !connected) return;
    Keyboard.dismiss();
    setStarting(kind);
    const name = title.trim() || (kind === 'shell' ? 'Terminal' : `${agentName(kind)} chat`);
    if (await run(() => workspace.actions.createSession(project.id, kind, name))) { setTitle(''); onClose(); }
    setStarting(null);
  };
  return <PickerSheet title="New terminal" visible={visible} onClose={onClose}>
    {!project ? <EmptyState icon="folder-outline" title="No shared projects"
      detail="Add a project folder in Vibyra Desktop on your computer, then refresh Projects." /> : <View style={s.content}>
      <View style={s.context}>
        <View style={[s.folder, { backgroundColor: colors.accentSoft }]}><Icon name="folder-outline" size={21} color={colors.accent} /></View>
        <View style={s.contextText}>
          <Text numberOfLines={2} style={[s.project, { color: colors.text }]}>{project.name}</Text>
          <View style={s.computer}>
            <View style={[s.dot, { backgroundColor: connected ? colors.success : colors.muted }]} />
            <Text numberOfLines={2} style={[s.host, { color: colors.muted }]}>
              {`${workspace.host?.name ?? 'Your computer'}${connected ? '' : ' · Offline'}`}</Text>
          </View>
        </View>
      </View>
      <View style={[s.nameField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="create-outline" size={19} color={colors.muted} />
        <TextInput value={title} onChangeText={setTitle} placeholder="Name (optional)" placeholderTextColor={colors.muted}
          accessibilityLabel="Session name" accessibilityHint="Give your new terminal a name, then tap a terminal below."
          maxLength={120} editable={!busy && !phoneBusy} returnKeyType="done" onSubmitEditing={Keyboard.dismiss}
          autoCorrect={false} style={[s.input, { color: colors.text }]} />
      </View>
      <View style={s.section}>
        <Text accessibilityRole="header" style={[s.label, { color: colors.muted }]}>Open on your computer</Text>
        {computerAgents.map((agent, index) => <View key={agent.kind}>
          {index > 0 && <View style={[s.separator, { backgroundColor: colors.border }]} />}
          <AgentRow mark={<AgentMark kind={agent.kind} size={44} />} name={agent.name} prominent
            detail={starting === agent.kind ? 'Starting terminal…' : detail[agent.kind]} busy={starting === agent.kind}
            disabled={busy || phoneBusy || !connected} onPress={() => void create(agent.kind)} />
        </View>)}
        {error && <Hint error>{error}</Hint>}
        {!connected && <Hint>Connect your computer to start one.</Hint>}
      </View>
      {vibes && onOpenChat && <PhoneAgents key={project.id} visible={visible} workspace={workspace} project={project}
        title={title.trim()} disabled={busy} onBusyChange={setPhoneBusy}
        onOpen={() => { onClose(); onOpenChat(); }} />}
      {workspace.demo && <Text style={[s.note, { color: colors.muted }]}>Sample workspace. No commands are sent.</Text>}
    </View>}
  </PickerSheet>;
}
const s = StyleSheet.create({
  content: { gap: 26, paddingTop: 12 },
  context: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 6 },
  folder: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  contextText: { flex: 1, gap: 5 }, project: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.5 },
  computer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 }, host: { flex: 1, fontSize: 13, lineHeight: 18 },
  nameField: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16, paddingHorizontal: 15, marginHorizontal: 4 },
  input: { flex: 1, minWidth: 0, minHeight: 52, fontSize: 16, paddingVertical: 12 },
  section: { gap: 0 },
  label: { fontSize: 13, fontWeight: '500', marginLeft: 8, marginBottom: 8 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 66, marginRight: 8, opacity: 0.6 },
  note: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
