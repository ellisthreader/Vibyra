import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import type { WorkspaceModel } from '../ui/types';
import type { AgentItem } from '../state/conversationTypes';
import type { CommandCatalogue, InspectorMode } from './inspection';
import { InspectorRow } from './InspectorRow';
import { inspectorStyles as s } from './inspectorStyles';

export function InspectorCommands({
  data,
  ready,
  workspace,
  onClose,
  onMode,
  onError,
}: {
  data: CommandCatalogue | null;
  ready: boolean;
  workspace: WorkspaceModel;
  onClose(): void;
  onMode(mode: InspectorMode, item?: AgentItem): void;
  onError(value: string): void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const normalized = query.toLowerCase();
  return (
    <>
      <TextInput
        accessibilityLabel="Search commands"
        placeholder="Find a command…"
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        style={[s.search, { color: colors.text, backgroundColor: colors.elevated }]}
      />
      {(data?.commands ?? [])
        .filter((c) => `${c.name} ${c.description}`.toLowerCase().includes(normalized))
        .map((c) => (
          <InspectorRow
            key={c.name}
            title={`/${c.name}`}
            subtitle={c.description}
            onPress={() => {
              if (c.name === 'stop') {
                if (ready)
                  void workspace.actions
                    .interruptTurn?.()
                    .then(onClose)
                    .catch((e) => onError(String(e)));
              } else onMode(c.name as InspectorMode);
            }}
          />
        ))}
      {query &&
        data?.unsupported
          .filter((c) => c.name.includes(normalized))
          .map((c) => (
            <View key={c.name}>
              <Text style={[s.rowTitle, { color: colors.text }]}>/{c.name}</Text>
              <Text style={[s.caption, { color: colors.muted }]}>{c.reason}</Text>
            </View>
          ))}
    </>
  );
}
