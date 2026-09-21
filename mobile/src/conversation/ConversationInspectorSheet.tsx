import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { OverlaySheet } from '../ui/OverlaySheet';
import { Button, Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import type { AgentItem } from '../state/conversationTypes';
import { changedFiles, readArtifact, type ArtifactPage, type CommandCatalogue, type InspectorMode, type ModelChoice } from './inspection';
import { relativeChangePath } from './usageSummary';
import { ConversationStatus } from './ConversationStatus';
import { ConversationUsage } from './ConversationUsage';
import { NativeDiff } from './NativeDiff';
import { NativeInspectorData } from './NativeInspectorData';
export function ConversationInspectorSheet({ mode, selected, workspace, onClose, onMode, inline = false }: {
  inline?: boolean; mode: InspectorMode | null; selected?: AgentItem; workspace: WorkspaceModel;
  onClose: () => void; onMode: (mode: InspectorMode, item?: AgentItem) => void;
}) {
  const { colors } = useTheme(); const [data, setData] = useState<any>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(''); const snapshot = workspace.conversation;
  const [model, setModel] = useState(snapshot?.settings?.model ?? ''); const [effort, setEffort] = useState(snapshot?.settings?.effort ?? '');
  useEffect(() => {
    if (!mode) return;
    let alive = true; setLoading(true); setError(''); setData(null);
    setModel(snapshot?.settings?.model ?? ''); setEffort(snapshot?.settings?.effort ?? '');
    const request = workspace.actions.conversationRequest;
    const work = !request ? Promise.reject(new Error('Update your computer to use conversation commands.'))
      : selected ? readArtifact(p => request<ArtifactPage>('conversation.artifact', p), selected)
      : mode === 'diff' || mode === 'context' ? Promise.resolve(null)
      : request(mode === 'help' ? 'conversation.commands' : mode === 'model' || mode === 'effort' ? 'conversation.models'
        : mode === 'permissions' ? 'conversation.status' : `conversation.${mode}`);
    void work.then(value => { if (alive) setData(value); }).catch(e => { if (alive) setError(String(e)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mode, selected?.id, selected?.artifact?.hash, snapshot?.sessionId]);
  const models: ModelChoice[] = data?.models ?? []; const chosen = models.find(m => m.model === model);
  const catalogue: CommandCatalogue | null = mode === 'help' ? data : null;
  const titles = { help: 'Commands', status: 'Session details', usage: 'Usage', model: 'Model', effort: 'Reasoning effort', permissions: 'Permissions', diff: 'Changes', context: 'Observed context' };
  const files = changedFiles(snapshot?.items ?? [], snapshot?.turnId);
  const ready = workspace.status === 'connected' && workspace.control === 'ready' && snapshot?.processState === 'running';
  const row = (title: string, subtitle: string, action: () => void, key: string) => <Pressable key={key} accessibilityRole="button" onPress={action} style={[s.row, { borderColor: colors.border }]}>
    <View style={s.rowBody}><Text style={[s.rowTitle, { color: colors.text }]}>{title}</Text><Text style={[s.caption, { color: colors.muted }]}>{subtitle}</Text></View><Icon name="chevron-forward" size={15} color={colors.muted} /></Pressable>;
  const content = <>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>{loading && <ActivityIndicator color={colors.muted} />}{error && <Text accessibilityRole="alert" style={[s.caption, { color: colors.error }]}>{error}</Text>}
      {selected && typeof data === 'string' && <><Text style={[s.caption, { color: colors.muted }]}>{selected.status}{selected.exitCode != null ? ` · Exit ${selected.exitCode}` : ''}</Text>
        {selected.category === 'fileChange' ? <NativeDiff content={data} root={snapshot?.workingDirectory} /> : <ScrollView horizontal><Text selectable style={[s.output, { color: colors.text }]}>{data}</Text></ScrollView>}
        {selected.truncated && <Text style={[s.caption, { color: colors.muted }]}>The first 256 KB was retained.</Text>}</>}
      {!selected && mode === 'help' && <><TextInput accessibilityLabel="Search commands" placeholder="Find a command…" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery}
        autoCorrect={false} autoCapitalize="none" style={[s.search, { color: colors.text, backgroundColor: colors.elevated }]} />
        {(catalogue?.commands ?? []).filter(c => `${c.name} ${c.description}`.toLowerCase().includes(query.toLowerCase())).map(c => row(`/${c.name}`, c.description, () => {
          if (c.name === 'stop') { if (ready) void workspace.actions.interruptTurn?.().then(onClose).catch(e => setError(String(e))); }
          else onMode(c.name as InspectorMode);
        }, c.name))}
        {query && catalogue?.unsupported.filter(c => c.name.includes(query.toLowerCase())).map(c => <View key={c.name}><Text style={[s.rowTitle, { color: colors.text }]}>/{c.name}</Text><Text style={[s.caption, { color: colors.muted }]}>{c.reason}</Text></View>)}</>}
      {!selected && (mode === 'model' || mode === 'effort') && <><Text style={[s.caption, { color: colors.muted }]}>Applies to the next turn. The active turn keeps its settings.</Text>
        {mode === 'model' && models.map(m => <Pressable accessibilityRole="radio" accessibilityState={{ checked: model === m.model }} key={m.model}
          style={[s.model, { borderColor: colors.border }]} onPress={() => { setModel(m.model); setEffort(m.defaultReasoningEffort); }}>
          <Text style={[s.rowTitle, { color: colors.text, flex: 1 }]}>{m.displayName}</Text><Icon name={model === m.model ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={model === m.model ? colors.accent : colors.muted} /></Pressable>)}
        <Text style={[s.label, { color: colors.muted }]}>Reasoning effort</Text><View style={s.efforts}>{chosen?.supportedReasoningEfforts.map(e => <Pressable key={e.reasoningEffort} accessibilityRole="radio" accessibilityState={{ checked: effort === e.reasoningEffort }}
          onPress={() => setEffort(e.reasoningEffort)} style={[s.effort, { borderColor: effort === e.reasoningEffort ? colors.accent : colors.border }]}>
          <Text style={{ color: effort === e.reasoningEffort ? colors.accent : colors.text }}>{e.reasoningEffort}</Text></Pressable>)}</View>
        <Button title={busy ? 'Applying…' : 'Apply for next turn'} disabled={!ready || !chosen || !effort || busy} onPress={() => {
          setBusy(true); void workspace.actions.setConversationSettings?.(model, effort, snapshot?.settings?.revision ?? 0)
            .then(onClose).catch(e => setError(String(e))).finally(() => setBusy(false));
        }} /></>}
      {!selected && mode === 'diff' && <><Text style={[s.caption, { color: colors.muted }]}>Current turn · {files.length} file operations</Text>
        {files.map((file, i) => row(relativeChangePath(file.path, snapshot?.workingDirectory), `${file.operation} · +${file.added} −${file.removed} · ${file.item.status}`, () => onMode('diff', file.item), `${file.item.id}:${i}`))}
        {!files.length && <Text style={[s.rowTitle, { color: colors.text }]}>No file changes were reported.</Text>}</>}
      {!selected && mode === 'context' && <><Text style={[s.caption, { color: colors.muted }]}>Files, searches and summaries reported by the provider.</Text>
        {snapshot?.items.filter(item => item.kind === 'activity').map(item => row(item.title ?? 'Recorded activity', item.status, () => onMode('context', item), item.id))}</>}
      {!selected && mode === 'status' && data && <ConversationStatus value={data} />}
      {!selected && mode === 'usage' && data && <ConversationUsage value={data} />}
      {!selected && mode === 'permissions' && data && <><Text style={[s.caption, { color: colors.muted }]}>Saved command rules are managed on your Mac. Phone typing permission is separate.</Text>
        <NativeInspectorData value={{ policy: data.settings?.approvalPolicy, sandbox: data.settings?.sandbox, savedRules: data.savedRules }} /></>}
    </ScrollView>
  </>;
  if (inline) return <View style={[s.inline, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={s.inlineHeader}><Text style={[s.rowTitle, { color: colors.text, flex: 1 }]}>{mode ? titles[mode] : ''}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close command result" onPress={onClose} style={s.close}><Icon name="close" size={18} /></Pressable></View>{content}</View>;
  return <OverlaySheet visible={mode !== null} title={selected?.title ?? (mode ? titles[mode] : '')} onClose={onClose}>{content}</OverlaySheet>;
}
const s = StyleSheet.create({ inline: { maxHeight: 280, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, overflow: 'hidden', marginBottom: 8 }, inlineHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, body: { gap: 15, padding: 22, paddingBottom: 48 }, row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 13 },
  rowBody: { flex: 1, gap: 5 }, rowTitle: { fontSize: 15, lineHeight: 23 }, caption: { fontSize: 13, lineHeight: 21 },
  output: { fontFamily: 'Menlo', fontSize: 13, lineHeight: 22 }, search: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  model: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 12, fontWeight: '600', marginTop: 12 }, efforts: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, effort: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, borderWidth: 1, borderRadius: 12 } });
