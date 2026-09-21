import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import type { WorkspaceModel } from '../ui/types';
import type { CommandCatalogue } from './inspection';

export function InlineCommands({ draft, workspace, onChoose }: { draft: string; workspace: WorkspaceModel; onChoose(command: string): void }) {
  const { colors } = useTheme(); const [catalogue, setCatalogue] = useState<CommandCatalogue>(); const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void workspace.actions.conversationRequest?.<CommandCatalogue>('conversation.commands').then(value => { if (alive) setCatalogue(value); }).catch(error => { if (alive) setError(String(error)); });
    return () => { alive = false; };
  }, [workspace.conversation?.sessionId]);
  const query = draft.trimStart().slice(1).split(/\s/)[0].toLowerCase();
  const commands = catalogue?.commands.filter(command => command.available && (command.name.startsWith(query) || command.aliases.some(alias => alias.startsWith(query)))) ?? [];
  return <View style={[s.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <ScrollView keyboardShouldPersistTaps="handled" style={s.scroll}>
      {commands.map(command => <Pressable key={command.name} accessibilityRole="button" accessibilityLabel={`/${command.name}`} onPress={() => onChoose(`/${command.name}`)} style={s.row}>
        <Text style={[s.name, { color: colors.text }]}>/{command.name}</Text><Text style={[s.description, { color: colors.muted }]}>{command.description}</Text>
      </Pressable>)}
      {!commands.length && <Text style={[s.empty, { color: colors.muted }]}>{error || (catalogue ? catalogue.unsupported.find(command => command.name === query)?.reason ?? 'No matching command.' : 'Loading commands…')}</Text>}
    </ScrollView>
  </View>;
}
const s = StyleSheet.create({ panel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, marginBottom: 8, overflow: 'hidden' }, scroll: { maxHeight: 210 },
  row: { minHeight: 50, paddingHorizontal: 16, paddingVertical: 10, gap: 3 }, name: { fontSize: 14, fontWeight: '600' }, description: { fontSize: 12, lineHeight: 17 }, empty: { padding: 16, fontSize: 13, lineHeight: 20 } });
