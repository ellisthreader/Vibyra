import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { OverlaySheet } from '../ui/OverlaySheet';
import { Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import type { AgentItem } from '../state/conversationTypes';
import { readArtifact, type ArtifactPage, type InspectorMode } from './inspection';
import { InspectorCommands } from './InspectorCommands';
import { InspectorDetails } from './InspectorDetails';
import { InspectorSettings } from './InspectorSettings';
import { inspectorStyles as s } from './inspectorStyles';

type Props = {
  inline?: boolean;
  mode: InspectorMode | null;
  selected?: AgentItem;
  workspace: WorkspaceModel;
  onClose(): void;
  onMode(mode: InspectorMode, item?: AgentItem): void;
};

const titles = {
  help: 'Commands',
  status: 'Session details',
  usage: 'Usage',
  model: 'Model',
  effort: 'Reasoning effort',
  permissions: 'Permissions',
  diff: 'Changes',
  context: 'Observed context',
};

export function ConversationInspectorSheet({
  mode,
  selected,
  workspace,
  onClose,
  onMode,
  inline = false,
}: Props) {
  const { colors } = useTheme();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const snapshot = workspace.conversation;
  useEffect(() => {
    if (!mode) return;
    let alive = true;
    setLoading(true);
    setError('');
    setData(null);
    const request = workspace.actions.conversationRequest;
    const work = !request
      ? Promise.reject(new Error('Update your computer to use conversation commands.'))
      : selected
        ? readArtifact((p) => request<ArtifactPage>('conversation.artifact', p), selected)
        : mode === 'diff' || mode === 'context'
          ? Promise.resolve(null)
          : request(
              mode === 'help'
                ? 'conversation.commands'
                : mode === 'model' || mode === 'effort'
                  ? 'conversation.models'
                  : mode === 'permissions'
                    ? 'conversation.status'
                    : `conversation.${mode}`,
            );
    void work
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [mode, selected, snapshot?.sessionId, workspace.actions.conversationRequest]);
  const ready =
    workspace.status === 'connected' &&
    workspace.control === 'ready' &&
    snapshot?.processState === 'running';
  const content = (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
      {loading && <ActivityIndicator color={colors.muted} />}
      {error && (
        <Text accessibilityRole="alert" style={[s.caption, { color: colors.error }]}>
          {error}
        </Text>
      )}
      {selected ||
      mode === 'diff' ||
      mode === 'context' ||
      mode === 'status' ||
      mode === 'usage' ||
      mode === 'permissions' ? (
        <InspectorDetails
          mode={mode}
          selected={selected}
          data={data}
          snapshot={snapshot}
          onMode={onMode}
        />
      ) : mode === 'help' ? (
        <InspectorCommands
          data={data}
          ready={ready}
          workspace={workspace}
          onClose={onClose}
          onMode={onMode}
          onError={setError}
        />
      ) : mode === 'model' || mode === 'effort' ? (
        <InspectorSettings
          key={`${mode}:${snapshot?.sessionId}`}
          data={data}
          ready={ready}
          workspace={workspace}
          onClose={onClose}
          onError={setError}
        />
      ) : null}
    </ScrollView>
  );
  if (inline)
    return (
      <View style={[s.inline, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.inlineHeader}>
          <Text style={[s.rowTitle, { color: colors.text, flex: 1 }]}>
            {mode ? titles[mode] : ''}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close command result"
            onPress={onClose}
            style={s.close}
          >
            <Icon name="close" size={18} />
          </Pressable>
        </View>
        {content}
      </View>
    );
  return (
    <OverlaySheet
      visible={mode !== null}
      title={selected?.title ?? (mode ? titles[mode] : '')}
      onClose={onClose}
    >
      {content}
    </OverlaySheet>
  );
}
