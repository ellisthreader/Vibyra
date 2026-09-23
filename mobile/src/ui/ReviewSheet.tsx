import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton } from './primitives';
import { ReviewContent, type ReviewMode } from './ReviewContent';
import { SegmentedControl } from './SegmentedControl';
import { Sheet } from './Sheet';
import type { Project, WorkspaceModel } from './types';

/** A project's files and changes as a sheet of their own, opened from a terminal. */
export function ReviewSheet({
  visible,
  onClose,
  project,
  workspace,
  initialMode = 'files',
}: {
  visible: boolean;
  onClose: () => void;
  project?: Project;
  workspace: WorkspaceModel;
  initialMode?: ReviewMode;
}) {
  const [mode, setMode] = useState<ReviewMode>(initialMode);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setMode(initialMode);
  }, [project?.id, visible, initialMode]);
  return (
    <Sheet
      title={project?.name ?? 'Project review'}
      visible={visible}
      onClose={onClose}
      scroll={false}
    >
      <View style={s.toolbar}>
        <SegmentedControl<ReviewMode>
          options={['files', 'changes']}
          value={mode}
          onChange={setMode}
          labels={{ files: 'Files', changes: 'Changes' }}
        />
        <View style={s.spacer} />
        <IconButton
          icon="refresh-outline"
          label="Refresh project review"
          onPress={() => setRevision((value) => value + 1)}
        />
      </View>
      {project && (
        <ReviewContent
          project={project}
          workspace={workspace}
          mode={mode}
          active={visible}
          revision={revision}
        />
      )}
    </Sheet>
  );
}
const s = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    gap: 5,
    paddingLeft: 20,
    paddingRight: 10,
    paddingTop: 2,
    paddingBottom: 8,
    alignItems: 'center',
  },
  spacer: { flex: 1 },
});
