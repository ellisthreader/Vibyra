import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { useVibesStore } from '../vibes/VibesProvider';
import { AgentMark, AgentRow } from './AgentRow';
import { agentName, computerAgents } from './agents';
import { PhoneAgents } from './PhoneAgents';
import { EmptyState, Hint, Icon } from './primitives';
import { PickerSheet } from './ModelPickerSheet';
import { TerminalOptions } from './TerminalOptions';
import { TerminalModelList } from './TerminalModelList';
import { useTerminalModels } from './useTerminalModels';
import { useAction } from './useAction';
import { styles as s } from './NewSessionSheetStyles';
import type { SessionKind, TerminalModel, WorkspaceModel } from './types';

export function NewSessionSheet({
  visible, workspace, initialProjectId, onClose, onOpenChat,
}: {
  visible: boolean;
  workspace: WorkspaceModel;
  initialProjectId?: string;
  onClose(): void;
  onOpenChat?: () => void;
}) {
  const { colors } = useTheme();
  const vibes = useVibesStore();
  const [title, setTitle] = useState('');
  const [safeMode, setSafeMode] = useState(false);
  const [provider, setProvider] = useState<'codex' | 'claude' | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const startingRef = useRef(false);
  const { busy, error, run, clearError } = useAction();
  const catalogue = useTerminalModels(visible, workspace);
  useEffect(() => {
    if (visible) {
      setTitle(''); setSafeMode(false); setProvider(null);
      clearError();
    }
  }, [visible, workspace.host?.id, initialProjectId, clearError]);
  const project =
    workspace.projects.find((item) => item.id === initialProjectId) ??
    (workspace.projects.length === 1 ? workspace.projects[0] : undefined);
  const connected = workspace.status === 'connected';
  const disabled =
    busy ||
    phoneBusy ||
    !connected ||
    (workspace.viewOnly === true && workspace.canManage !== true);
  const create = async (kind: SessionKind, model?: TerminalModel) => {
    if (!project || disabled || startingRef.current) return;
    startingRef.current = true;
    Keyboard.dismiss();
    setStarting(model?.id ?? kind);
    const name =
      title.trim() || model?.name || (kind === 'shell' ? 'Terminal' : `${agentName(kind)} chat`);
    const ok = await run(() =>
      workspace.actions.createSession(project.id, kind, name, {
        safeMode,
        ...(model ? { model: model.id } : {}),
      }),
    );
    startingRef.current = false;
    setStarting(null);
    if (ok) {
      setTitle(''); onClose();
    }
  };
  return (
    <PickerSheet
      title="New terminal"
      visible={visible}
      onClose={() => {
        if (!busy && !phoneBusy) onClose();
      }}
    >
      {!project ? (
        <EmptyState
          icon="folder-outline"
          title="No shared projects"
          detail="Add a project folder in Vibyra Desktop on your computer, then refresh Projects."
        />
      ) : (
        <View style={s.content}>
          <View style={s.context}>
            <Icon name="folder-outline" size={16} color={colors.muted} />
            <Text numberOfLines={1} style={[s.project, { color: colors.muted }]}>
              {project.name}
            </Text>
            <View style={[s.dot, { backgroundColor: connected ? colors.success : colors.muted }]} />
          </View>
          {provider ? (
            <View style={s.hero}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to terminal choices"
                disabled={busy}
                onPress={() => {
                  setProvider(null);
                  clearError();
                }}
                style={s.back}
              >
                <Icon name="chevron-back" size={18} color={colors.accent} />
                <Text style={[s.backText, { color: colors.accent }]}>{agentName(provider)}</Text>
              </Pressable>
              <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>
                Choose a model.
              </Text>
              <Text style={[s.subtitle, { color: colors.muted }]}>
                Tap a model to start on {workspace.host?.name ?? 'your computer'}.
              </Text>
            </View>
          ) : (
            <View style={s.hero}>
              <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>
                Start something.
              </Text>
              <Text
                style={[s.subtitle, { color: colors.muted }]}
              >{`${workspace.host?.name ?? 'Your computer'}${connected ? ' · Your AI accounts' : ' · Offline'}`}</Text>
            </View>
          )}
          {provider ? (
            <TerminalModelList
              key={provider}
              models={catalogue.models.filter((model) => model.kind === provider)}
              loading={catalogue.loading}
              error={catalogue.error}
              busy={disabled}
              starting={starting}
              refresh={catalogue.refresh}
              choose={(model) => void create(model.kind, model)}
            />
          ) : (
            <View style={s.choices}>
              {computerAgents.map((agent) => (
                <View key={agent.kind} style={[s.choice, { borderColor: colors.border }]}>
                  <AgentRow
                    mark={<AgentMark kind={agent.kind} size={34} />}
                    name={agent.name}
                    detail={
                      starting === agent.kind
                        ? 'Starting terminal…'
                        : agent.kind === 'shell'
                          ? 'A plain command line'
                          : catalogue.supported
                            ? 'Choose a model'
                            : 'Use your computer’s default model'
                    }
                    busy={starting === agent.kind}
                    disabled={disabled}
                    onPress={() => {
                      if (agent.kind !== 'shell' && catalogue.supported) setProvider(agent.kind);
                      else void create(agent.kind);
                    }}
                  />
                </View>
              ))}
            </View>
          )}
          {error && <Hint error>{error}</Hint>}
          {!connected && <Hint>Connect your computer to start one.</Hint>}
          {connected && workspace.viewOnly && !workspace.canManage && (
            <Hint>Turn on Typing from your phone in Vibyra on your computer.</Hint>
          )}
          <TerminalOptions
            key={`${visible}:${project.id}`}
            title={title}
            setTitle={setTitle}
            safeMode={safeMode}
            setSafeMode={setSafeMode}
            disabled={busy || phoneBusy}
          />
          {!provider && vibes && onOpenChat && (
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
