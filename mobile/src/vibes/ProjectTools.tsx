import { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button, Hint } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { useVibes } from './VibesProvider';
import type { VibesTool } from './types';

export function ProjectTools({ workspace }: { workspace: WorkspaceModel }) {
  const { store, chats, selected, turns, wallet } = useVibes(); const { colors } = useTheme();
  const chat = chats.find(c => c.id === selected);
  const turn = turns.find(t => t.status === 'waiting');
  const tool = turn?.tools?.find(t => t.result === null);
  const [busy, setBusy] = useState(false); const lock = useRef(false); const attempted = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState<'allow' | 'decline'>('allow');
  const connected = workspace.status === 'connected' && workspace.host?.id === chat?.host_id;
  const respond = async (t: VibesTool, decision: 'allow' | 'decline') => {
    if (lock.current || !chat?.binding || !wallet || !workspace.actions.vibesProjectRequest || !store.api.toolResult || !connected) return;
    lock.current = true; setBusy(true); setError(null); setLastDecision(decision);
    try {
      if (!turn || t.expiresAt * 1000 <= Date.now()) throw new Error('This request expired. Refresh the chat before continuing.');
      const fresh = await store.api.turn(turn.id);
      if (fresh.status !== 'waiting' || !fresh.tools?.some(x => x.id === t.id && x.result === null)) {
        await store.refresh(); return;
      }
      const result = await workspace.actions.vibesProjectRequest('vibes.tool', {
        ...t.arguments, operation: t.operation, decision, toolId: t.id, expiresAt: t.expiresAt, hostId: chat.host_id!, projectId: chat.project_id!,
        chatId: chat.id, accountToken: wallet.accountToken, binding: chat.binding,
      });
      await store.api.toolResult(t.id, decision, result);
      await store.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'The tool response could not be confirmed.'); }
    finally { lock.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (tool && tool.operation !== 'write_file' && connected && AppState.currentState === 'active' && attempted.current !== tool.id) {
      attempted.current = tool.id; void respond(tool, 'allow');
    }
  }, [tool?.id, connected]);
  if (!tool) return null;
  return <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[s.title, { color: colors.text }]}>{tool.operation === 'write_file' ? 'Review this file edit' : 'Reading your project'}</Text>
    <Text selectable style={[s.path, { color: colors.muted }]}>{tool.arguments.path || 'Project files'}</Text>
    {tool.operation === 'write_file' && <>
      <Text style={[s.detail, { color: colors.muted }]}>{tool.arguments.expectedSha256 === 'new' ? 'Create' : 'Replace'} this file with the following content in {workspace.projects.find(p => p.id === chat?.project_id)?.name ?? 'your authorized project'}.</Text>
      <ScrollView style={[s.code, { backgroundColor: colors.elevated }]}><Text selectable style={[s.codeText, { color: colors.text }]}>{tool.arguments.content}</Text></ScrollView>
      <View style={s.buttons}><View style={s.button}><Button title="Allow this edit" busy={busy} disabled={!connected} onPress={() => void respond(tool, 'allow')} /></View>
        <View style={s.button}><Button title="Decline" secondary disabled={busy || !connected} onPress={() => void respond(tool, 'decline')} /></View></View>
    </>}
    {!connected && <Hint>Reconnect to the authorized computer to respond. Nothing is approved while disconnected.</Hint>}
    {error && <><Hint error>{error}</Hint><Button secondary title="Check this response again" disabled={!connected || busy} onPress={() => void respond(tool, lastDecision)} /></>}
  </View>;
}
const s = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 19, padding: 16, gap: 10 }, title: { fontSize: 15, fontWeight: '600' },
  path: { fontSize: 12 }, detail: { fontSize: 13, lineHeight: 20 }, code: { maxHeight: 140, borderRadius: 9, padding: 10 }, codeText: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  buttons: { flexDirection: 'row', gap: 10 }, button: { flex: 1 } });
