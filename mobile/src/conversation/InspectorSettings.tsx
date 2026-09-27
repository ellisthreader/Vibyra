import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import type { ModelChoice } from './inspection';
import { inspectorStyles as s } from './inspectorStyles';

export function InspectorSettings({
  data,
  ready,
  workspace,
  onClose,
  onError,
}: {
  data: { models?: ModelChoice[] } | null;
  ready: boolean;
  workspace: WorkspaceModel;
  onClose(): void;
  onError(value: string): void;
}) {
  const { colors } = useTheme();
  const snapshot = workspace.conversation;
  const [model, setModel] = useState(snapshot?.settings?.model ?? '');
  const [effort, setEffort] = useState(snapshot?.settings?.effort ?? '');
  const [busy, setBusy] = useState(false);
  const models = data?.models ?? [];
  const chosen = models.find((m) => m.model === model);
  return (
    <>
      <Text style={[s.caption, { color: colors.muted }]}>
        Applies to the next turn. The active turn keeps its settings.
      </Text>
      {models.map((m) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: model === m.model }}
          key={m.model}
          style={[s.model, { borderColor: colors.border }]}
          onPress={() => {
            setModel(m.model);
            setEffort(m.defaultReasoningEffort);
          }}
        >
          <Text style={[s.rowTitle, { color: colors.text, flex: 1 }]}>{m.displayName}</Text>
          <Icon
            name={model === m.model ? 'checkmark-circle' : 'ellipse-outline'}
            size={21}
            color={model === m.model ? colors.accent : colors.muted}
          />
        </Pressable>
      ))}
      <Text style={[s.label, { color: colors.muted }]}>Reasoning effort</Text>
      <View style={s.efforts}>
        {chosen?.supportedReasoningEfforts.map((e) => (
          <Pressable
            key={e.reasoningEffort}
            accessibilityRole="radio"
            accessibilityState={{ checked: effort === e.reasoningEffort }}
            onPress={() => setEffort(e.reasoningEffort)}
            style={[
              s.effort,
              {
                borderColor: effort === e.reasoningEffort ? colors.accent : colors.border,
              },
            ]}
          >
            <Text
              style={{
                color: effort === e.reasoningEffort ? colors.accent : colors.text,
              }}
            >
              {e.reasoningEffort}
            </Text>
          </Pressable>
        ))}
      </View>
      <Button
        title={busy ? 'Applying…' : 'Apply for next turn'}
        disabled={!ready || !chosen || !effort || busy}
        onPress={() => {
          setBusy(true);
          void workspace.actions
            .setConversationSettings?.(model, effort, snapshot?.settings?.revision ?? 0)
            .then(onClose)
            .catch((e) => onError(String(e)))
            .finally(() => setBusy(false));
        }}
      />
    </>
  );
}
