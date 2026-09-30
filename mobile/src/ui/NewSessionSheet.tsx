import { styles as s } from './NewSessionSheetStyles';
import { useEffect, useState } from 'react';
import { Keyboard, Text, TextInput, View } from 'react-native';
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
  claude: 'Code with Claude',
  codex: 'Code with OpenAI',
  shell: 'Run commands yourself',
};

/**
 * The project is already settled in the sidebar. Computer runners are the
 * primary path; the phone catalogue is a secondary disclosure. Every runner
 * still starts directly, using the optional name above it.
 */
export function NewSessionSheet({
  visible,
  workspace,
  initialProjectId,
  onClose,
  onOpenChat,
}: {
  visible: boolean;
  workspace: WorkspaceModel;
  initialProjectId?: string;
  onClose: () => void;
  /** Shows the AI chat once a phone-run agent has started; absent when the phone has none. */
  onOpenChat?: () => void;
}) {
  const { colors } = useTheme();
  const vibes = useVibesStore();
  const [title, setTitle] = useState('');
  const [starting, setStarting] = useState<SessionKind | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const { busy, error, run, clearError } = useAction();
  useEffect(() => {
    if (visible) {
      setTitle('');
      clearError();
    }
  }, [visible, clearError]);
  const project =
    workspace.projects.find((item) => item.id === initialProjectId) ??
    (workspace.projects.length === 1 ? workspace.projects[0] : undefined);
  const connected = workspace.status === 'connected';
  const create = async (kind: SessionKind) => {
    if (!project || busy || phoneBusy || !connected) return;
    Keyboard.dismiss();
    setStarting(kind);
    const name = title.trim() || (kind === 'shell' ? 'Terminal' : `${agentName(kind)} chat`);
    if (await run(() => workspace.actions.createSession(project.id, kind, name))) {
      setTitle('');
      onClose();
    }
    setStarting(null);
  };
  return (
    <PickerSheet title="New terminal" visible={visible} onClose={onClose}>
      {!project ? (
        <EmptyState
          icon="folder-outline"
          title="No shared projects"
          detail="Add a project folder in Vibyra Desktop on your computer, then refresh Projects."
        />
      ) : (
        <View style={s.content}>
          <View style={s.context}>
            <View style={[s.folder, { backgroundColor: colors.accentSoft }]}>
              <Icon name="folder-outline" size={20} color={colors.accent} />
            </View>
            <View style={s.contextText}>
              <Text numberOfLines={2} style={[s.project, { color: colors.text }]}>
                {project.name}
              </Text>
              <View style={s.computer}>
                <View
                  style={[s.dot, { backgroundColor: connected ? colors.success : colors.muted }]}
                />
                <Text numberOfLines={2} style={[s.host, { color: colors.muted }]}>
                  {`${workspace.host?.name ?? 'Your computer'}${connected ? '' : ' · Offline'}`}
                </Text>
              </View>
            </View>
          </View>
          <View
            style={[s.nameField, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Icon name="create-outline" size={18} color={colors.muted} />
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Name (optional)"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Session name"
              accessibilityHint="Give your new terminal a name, then tap a terminal below."
              maxLength={120}
              editable={!busy && !phoneBusy}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              autoCorrect={false}
              style={[s.input, { color: colors.text }]}
            />
          </View>
          <View style={s.section}>
            <Text accessibilityRole="header" style={[s.label, { color: colors.muted }]}>
              Open on your computer
            </Text>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {computerAgents.map((agent, index) => (
                <View key={agent.kind}>
                  {index > 0 && <View style={[s.separator, { backgroundColor: colors.border }]} />}
                  <AgentRow
                    mark={<AgentMark kind={agent.kind} size={36} />}
                    name={agent.name}
                    prominent
                    detail={starting === agent.kind ? 'Starting terminal…' : detail[agent.kind]}
                    busy={starting === agent.kind}
                    disabled={busy || phoneBusy || !connected}
                    onPress={() => void create(agent.kind)}
                  />
                </View>
              ))}
            </View>
            {error && <Hint error>{error}</Hint>}
            {!connected && <Hint>Connect your computer to start one.</Hint>}
          </View>
          {vibes && onOpenChat && (
            <PhoneAgents
              key={project.id}
              visible={visible}
              workspace={workspace}
              project={project}
              title={title.trim()}
              disabled={busy}
              onBusyChange={setPhoneBusy}
              onOpen={() => {
                onClose();
                onOpenChat();
              }}
            />
          )}
          {workspace.demo && (
            <Text style={[s.note, { color: colors.muted }]}>
              Sample workspace. No commands are sent.
            </Text>
          )}
        </View>
      )}
    </PickerSheet>
  );
}
