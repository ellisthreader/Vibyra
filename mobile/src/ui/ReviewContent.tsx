import { styles as s } from './ReviewContentStyles';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { CodeContent } from './CodeContent';
import { EmptyState, Hint, Icon, IconButton } from './primitives';
import type { FileEntry, Project, WorkspaceModel } from './types';

export type ReviewMode = 'files' | 'changes';
/**
 * A project's files or its working-tree changes, read from the computer. The
 * owner chooses which (`mode`) and can ask for a fresh read (`revision`); the
 * folder being browsed and any file opened from it are this component's own,
 * and reset when the mode changes. Fills the height it is given.
 */
export function ReviewContent({
  project,
  workspace,
  mode,
  active,
  revision = 0,
}: {
  project: Project;
  workspace: WorkspaceModel;
  mode: ReviewMode;
  active: boolean;
  revision?: number;
}) {
  const { colors } = useTheme();
  const [path, setPath] = useState('');
  const [file, setFile] = useState(false);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [content, setContent] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions = useRef(workspace.actions);
  actions.current = workspace.actions;
  useEffect(() => {
    setPath('');
    setFile(false);
  }, [project.id, mode]);
  useEffect(() => {
    if (!active) return;
    let current = true;
    setBusy(true);
    setError(null);
    setContent('');
    setEntries([]);
    setTruncated(false);
    const load = async () => {
      if (mode === 'changes') {
        const result = await actions.current.getDiff(project.id);
        if (current) {
          setContent(result.diff);
          setTruncated(result.truncated);
        }
      } else if (file) {
        const result = await actions.current.readFile(project.id, path);
        if (current) {
          setContent(result.content);
          setTruncated(result.truncated);
        }
      } else {
        const result = await actions.current.listFiles(project.id, path);
        if (current) setEntries(result.entries);
      }
    };
    void load()
      .catch((cause) => {
        if (current)
          setError(cause instanceof Error ? cause.message : 'Unable to read this project.');
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [active, project.id, mode, file, path, revision]);
  const parent = () => {
    setPath(path.split('/').slice(0, -1).join('/'));
    setFile(false);
  };
  return (
    <View style={s.fill}>
      {mode === 'files' && (
        <View style={[s.breadcrumb, { borderBottomColor: colors.border }]}>
          {path ? (
            <IconButton icon="arrow-back" label="Parent folder" onPress={parent} />
          ) : (
            <Icon name="folder-outline" size={18} color={colors.muted} />
          )}
          <Text numberOfLines={2} selectable style={[s.path, { color: colors.muted }]}>
            {path || project.path}
          </Text>
        </View>
      )}
      {mode === 'changes' && (
        <View style={s.notice}>
          <Hint>
            {workspace.demo
              ? 'Example changes · No files on your computer are affected.'
              : 'Current working tree changes. This may include work from other sessions.'}
          </Hint>
        </View>
      )}
      {busy ? (
        <View style={s.loading}>
          <ActivityIndicator color={colors.accent} />
          <Hint>{workspace.demo ? 'Opening example…' : 'Reading from your computer…'}</Hint>
        </View>
      ) : error ? (
        <View style={s.notice}>
          <Hint error>{error}</Hint>
        </View>
      ) : mode === 'files' && !file ? (
        <ScrollView contentContainerStyle={s.files}>
          {entries.length === 0 ? (
            <EmptyState
              icon="folder-open-outline"
              title="No files here"
              detail="This folder is empty or contains only files hidden by the host’s access policy."
            />
          ) : (
            entries.map((entry) => (
              <Pressable
                key={entry.path}
                accessibilityRole="button"
                onPress={() => {
                  setPath(entry.path);
                  setFile(entry.kind !== 'directory');
                }}
                style={[s.file, { borderBottomColor: colors.border }]}
              >
                <Icon
                  name={entry.kind === 'directory' ? 'folder-outline' : 'document-text-outline'}
                  size={19}
                  color={entry.kind === 'directory' ? colors.accent : colors.muted}
                />
                <Text numberOfLines={2} style={[s.fileName, { color: colors.text }]}>
                  {entry.name}
                </Text>
                {entry.kind === 'directory' ? (
                  <Icon name="chevron-forward" size={15} color={colors.muted} />
                ) : (
                  <Text style={[s.size, { color: colors.muted }]}>{formatSize(entry.size)}</Text>
                )}
              </Pressable>
            ))
          )}
        </ScrollView>
      ) : content ? (
        <ScrollView style={[s.fill, { backgroundColor: colors.workspace }]}>
          {truncated && (
            <View style={s.notice}>
              <Hint>The computer returned a limited preview of this file or diff.</Hint>
            </View>
          )}
          <CodeContent content={content} diff={mode === 'changes'} />
        </ScrollView>
      ) : (
        <EmptyState
          icon={mode === 'changes' ? 'checkmark-circle-outline' : 'document-outline'}
          title={mode === 'changes' ? 'No working tree changes' : 'Empty file'}
          detail={
            mode === 'changes'
              ? 'Your computer reported no diff for this project.'
              : 'This file has no text content.'
          }
        />
      )}
    </View>
  );
}
function formatSize(size: number) {
  return size < 1024
    ? `${size} B`
    : size < 1024 ** 2
      ? `${Math.round(size / 1024)} KB`
      : `${(size / 1024 ** 2).toFixed(1)} MB`;
}
