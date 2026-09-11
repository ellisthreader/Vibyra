import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Sheet } from '../ui/Sheet';
import { Button, Hint, Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { useVibes } from './VibesProvider';

export function ProjectSheet({ visible, onClose, workspace }: { visible: boolean; onClose(): void; workspace: WorkspaceModel }) {
  const { colors } = useTheme(); const { store, wallet, pending } = useVibes();
  const [projectId, setProjectId] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const attach = async () => {
    if (!wallet || !workspace.actions.vibesProjectRequest || !store.api.attach || !workspace.host || busy) return;
    setBusy(true); setError(null);
    try {
      const chatId = await store.chat('Project chat');
      const result = await workspace.actions.vibesProjectRequest('vibes.bind', {
        hostId: workspace.host.id, projectId, chatId, accountToken: wallet.accountToken,
      });
      if (typeof result.binding !== 'string') throw new Error('The computer did not authorize this project.');
      await store.api.attach(chatId, workspace.host.id, projectId, result.binding);
      await store.refresh(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Project could not be attached.'); }
    finally { setBusy(false); }
  };
  return <Sheet title="Use a project" visible={visible} onClose={onClose}>
    <Text style={[s.description, { color: colors.muted }]}>Allow this chat to read files in one project and share their contents with Vibyra, OpenRouter and your chosen AI provider. You review each file edit before it runs.</Text>
    {!workspace.vibesToolsAvailable || workspace.status !== 'connected' ? <Hint>Connect an updated Vibyra Host to use project tools.</Hint> :
      workspace.projects.map(p => <Pressable key={p.id} accessibilityRole="radio" accessibilityLabel={p.name} aria-checked={p.id === projectId}
        accessibilityState={{ checked: p.id === projectId, disabled: busy }} disabled={busy} onPress={() => setProjectId(p.id)}
        style={[s.row, { borderColor: p.id === projectId ? colors.accent : colors.border }]}>
        <Icon name="folder-outline" size={19} color={colors.muted} /><View style={s.text}>
          <Text style={[s.name, { color: colors.text }]}>{p.name}</Text><Text style={[s.detail, { color: colors.muted }]}>{workspace.host?.name}</Text></View>
        <Icon name={p.id === projectId ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.accent} />
      </Pressable>)}
    {error && <Hint error>{error}</Hint>}
    <Button title="Use this project" busy={busy} disabled={!projectId || Boolean(pending) || !wallet?.consented} onPress={() => void attach()} />
    <Button title="Not now" secondary onPress={onClose} />
  </Sheet>;
}
const s = StyleSheet.create({ description: { fontSize: 14, lineHeight: 22 }, row: { borderWidth: 1, borderRadius: 17, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, gap: 6 }, name: { fontSize: 15, fontWeight: '500' }, detail: { fontSize: 12 } });
