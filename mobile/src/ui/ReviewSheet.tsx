import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { EmptyState, Hint, Icon, IconButton } from './primitives';
import { Sheet } from './Sheet';
import { CodeContent } from './CodeContent';
import type { FileEntry, Project, WorkspaceModel } from './types';

type ReviewMode = 'files' | 'changes' | 'file';
export function ReviewSheet({ visible, onClose, project, workspace, initialMode = 'files' }: {
  visible: boolean; onClose: () => void; project?: Project; workspace: WorkspaceModel; initialMode?: 'files' | 'changes';
}) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<ReviewMode>('files');
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [content, setContent] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const actions = useRef(workspace.actions);
  actions.current = workspace.actions;
  useEffect(() => { setMode(initialMode); setPath(''); }, [project?.id, visible, initialMode]);
  useEffect(() => {
    if (!visible || !project) return;
    let current = true;
    setBusy(true); setError(null); setContent(''); setEntries([]); setTruncated(false);
    const load = async () => {
      if (mode === 'files') {
        const result = await actions.current.listFiles(project.id, path);
        if (current) setEntries(result.entries);
      } else if (mode === 'file') {
        const result = await actions.current.readFile(project.id, path);
        if (current) { setContent(result.content); setTruncated(result.truncated); }
      } else {
        const result = await actions.current.getDiff(project.id);
        if (current) { setContent(result.diff); setTruncated(result.truncated); }
      }
    };
    void load().catch(cause => { if (current) setError(cause instanceof Error ? cause.message : 'Unable to read this project.'); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [visible, project?.id, mode, path, revision]);
  const parent = () => { setPath(path.split('/').slice(0, -1).join('/')); setMode('files'); };
  return <Sheet title={project?.name ?? 'Project review'} visible={visible} onClose={onClose} scroll={false}>
    <View style={s.toolbar}>
      {(['files', 'changes'] as const).map(item => <Pressable key={item} accessibilityRole="tab"
        aria-selected={item === (mode === 'file' ? 'files' : mode)} accessibilityState={{ selected: item === (mode === 'file' ? 'files' : mode) }}
        onPress={() => { setMode(item); setPath(''); }} style={[s.tab,
          { backgroundColor: item === (mode === 'file' ? 'files' : mode) ? colors.elevated : 'transparent' }]}>
        <Text style={[s.tabText, { color: colors.text }]}>{item === 'files' ? 'Files' : 'Changes'}</Text>
      </Pressable>)}<View style={s.spacer} />
      <IconButton icon="refresh-outline" label="Refresh project review" disabled={busy} onPress={() => setRevision(value => value + 1)} />
    </View>
    {mode !== 'changes' && <View style={[s.breadcrumb, { borderBottomColor: colors.border }]}>
      {path ? <IconButton icon="arrow-back" label="Parent folder" onPress={parent} /> : <Icon name="folder-outline" size={18} color={colors.muted} />}
      <Text numberOfLines={2} selectable style={[s.path, { color: colors.muted }]}>{path || project?.path || 'Project'}</Text>
    </View>}
    {mode === 'changes' && <View style={s.notice}><Hint>{workspace.demo ? 'Example changes · No files on your computer are affected.' : 'Current working tree changes. This may include work from other sessions.'}</Hint></View>}
    {busy ? <View style={s.loading}><ActivityIndicator color={colors.accent} /><Hint>{workspace.demo ? 'Opening example…' : 'Reading from your computer…'}</Hint></View> :
      error ? <View style={s.notice}><Hint error>{error}</Hint></View> : mode === 'files' ?
        <ScrollView contentContainerStyle={s.files}>{entries.length === 0 ? <EmptyState icon="folder-open-outline"
          title="No files here" detail="This folder is empty or contains only files hidden by the host’s access policy." /> :
          entries.map(entry => <Pressable key={entry.path} accessibilityRole="button" onPress={() => {
            setPath(entry.path); setMode(entry.kind === 'directory' ? 'files' : 'file');
          }} style={[s.file, { borderBottomColor: colors.border }]}>
            <Icon name={entry.kind === 'directory' ? 'folder-outline' : 'document-text-outline'} size={21} color={colors.muted} />
            <Text numberOfLines={2} style={[s.fileName, { color: colors.text }]}>{entry.name}</Text>
            {entry.kind === 'directory' ? <Icon name="chevron-forward" size={16} color={colors.muted} /> :
              <Text style={[s.size, { color: colors.muted }]}>{formatSize(entry.size)}</Text>}
          </Pressable>)}</ScrollView> : content ? <ScrollView style={[s.codeScroll, { backgroundColor: colors.workspace }]}>
          {truncated && <View style={s.notice}><Hint>The computer returned a limited preview of this file or diff.</Hint></View>}
          <CodeContent content={content} diff={mode === 'changes'} />
        </ScrollView> : <EmptyState icon={mode === 'changes' ? 'checkmark-circle-outline' : 'document-outline'}
          title={mode === 'changes' ? 'No working tree changes' : 'Empty file'}
          detail={mode === 'changes' ? 'Your computer reported no diff for this project.' : 'This file has no text content.'} />}
  </Sheet>;
}
function formatSize(size: number) { return size < 1024 ? `${size} B` : size < 1024 ** 2 ? `${Math.round(size / 1024)} KB` : `${(size / 1024 ** 2).toFixed(1)} MB`; }
const s = StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: 5, paddingHorizontal: 15, paddingVertical: 9, alignItems: 'center' },
  tab: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center' }, tabText: { fontSize: 14, fontWeight: '500' },
  spacer: { flex: 1 }, breadcrumb: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 22, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth }, path: { flex: 1, fontSize: 12, lineHeight: 18 },
  loading: { padding: 40, alignItems: 'center', gap: 17 }, notice: { paddingHorizontal: 22, paddingVertical: 15 },
  files: { paddingHorizontal: 22, paddingBottom: 25 }, file: { minHeight: 61, flexDirection: 'row', alignItems: 'center',
    gap: 13, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth }, fileName: { flex: 1, fontSize: 15, lineHeight: 22 },
  size: { fontSize: 11 }, codeScroll: { flex: 1 }, codeContent: { padding: 20 },
  code: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, lineHeight: 19 },
});
