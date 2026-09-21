import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { IconButton } from './primitives';
import { ReviewContent, type ReviewMode } from './ReviewContent';
import { Sheet } from './Sheet';
import type { Project, WorkspaceModel } from './types';

/** A project's files and changes as a sheet of their own, opened from a terminal. */
export function ReviewSheet({ visible, onClose, project, workspace, initialMode = 'files' }: {
  visible: boolean; onClose: () => void; project?: Project; workspace: WorkspaceModel; initialMode?: ReviewMode;
}) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<ReviewMode>(initialMode);
  const [revision, setRevision] = useState(0);
  useEffect(() => { setMode(initialMode); }, [project?.id, visible, initialMode]);
  return <Sheet title={project?.name ?? 'Project review'} visible={visible} onClose={onClose} scroll={false}>
    <View style={s.toolbar}>
      {(['files', 'changes'] as const).map(item => <Pressable key={item} accessibilityRole="tab"
        aria-selected={item === mode} accessibilityState={{ selected: item === mode }} onPress={() => setMode(item)}
        style={[s.tab, { backgroundColor: item === mode ? colors.elevated : 'transparent' }]}>
        <Text style={[s.tabText, { color: colors.text }]}>{item === 'files' ? 'Files' : 'Changes'}</Text>
      </Pressable>)}<View style={s.spacer} />
      <IconButton icon="refresh-outline" label="Refresh project review" onPress={() => setRevision(value => value + 1)} />
    </View>
    {project && <ReviewContent project={project} workspace={workspace} mode={mode} active={visible} revision={revision} />}
  </Sheet>;
}
const s = StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: 5, paddingHorizontal: 15, paddingVertical: 9, alignItems: 'center' },
  tab: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center' }, tabText: { fontSize: 14, fontWeight: '500' },
  spacer: { flex: 1 },
});
