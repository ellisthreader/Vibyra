import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../theme';
import { confirmAction } from '../confirm';
import { OverlaySheet } from '../OverlaySheet';
import { Hint } from '../primitives';
import { useAction } from '../useAction';
import type { Project } from '../types';
import { MONO } from './mono';
import { WizardButton } from './WizardButton';

/**
 * What can be done to a project from the phone: what it is called here, and
 * whether it is listed at all.
 *
 * Both are about the list. The folder is not renamed, moved or deleted by
 * either — which is why the destructive-sounding one is "Remove from Vibyra"
 * and says where the files go, rather than "Delete" with a warning under it.
 * A phone should not be able to delete a computer's folder by mistake, and
 * nothing here can.
 */
export function ProjectActionsSheet({
  project,
  host,
  reason,
  onRename,
  onForget,
  onClose,
}: {
  project: Project | null;
  host: string;
  /** Why this computer will not allow either change, or null when it will. */
  reason?: string | null;
  onRename: (name: string) => Promise<void>;
  onForget: () => Promise<void>;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const { busy, error, run } = useAction();
  useEffect(() => {
    setName(project?.name ?? '');
  }, [project]);
  const trimmed = name.trim();
  const blocked = Boolean(reason);
  const changed = !blocked && trimmed.length > 0 && trimmed !== project?.name;
  const forget = () =>
    project &&
    confirmAction(
      'Remove this project?',
      `${project.name} leaves the list on this phone and on ${host}. The folder and everything in it stays exactly where it is.`,
      'Remove',
      () =>
        void run(async () => {
          await onForget();
          onClose();
        }),
    );
  return (
    <OverlaySheet
      visible={project !== null}
      title="Project"
      label="Project options"
      onClose={onClose}
    >
      <View style={s.body}>
        <Text accessibilityRole="header" style={[s.label, { color: colors.muted }]}>
          Name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          editable={!blocked}
          maxLength={64}
          accessibilityLabel="Project name"
          returnKeyType="done"
          style={[s.input, { color: colors.text, backgroundColor: colors.elevated }]}
        />
        <Text numberOfLines={1} style={[s.path, { color: colors.muted }]}>
          {project?.path ?? ''}
        </Text>
        {reason ? (
          <View style={s.notice}>
            <Hint>{reason}</Hint>
          </View>
        ) : null}
        {error ? (
          <View style={s.notice}>
            <Hint error>{error}</Hint>
          </View>
        ) : null}
        <View style={s.actions}>
          <WizardButton
            title="Save name"
            onPress={() =>
              void run(async () => {
                await onRename(trimmed);
                onClose();
              })
            }
            busy={busy}
            disabled={!changed}
          />
          <WizardButton
            title="Remove from Vibyra"
            label="Remove this project from Vibyra"
            secondary
            onPress={forget}
            disabled={busy || blocked}
          />
        </View>
        <Text style={[s.quiet, { color: colors.muted }]}>
          {`Renaming changes what it is called in Vibyra. The folder on ${host} keeps its own name, and removing a project never deletes it.`}
        </Text>
      </View>
    </OverlaySheet>
  );
}
const s = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2, marginLeft: 2, marginBottom: 8 },
  input: { minHeight: 50, fontSize: 16, borderRadius: 14, paddingHorizontal: 16 },
  path: { fontFamily: MONO, fontSize: 12.5, marginTop: 10, marginLeft: 2 },
  notice: { marginTop: 14 },
  actions: { marginTop: 22, gap: 10 },
  quiet: { fontSize: 13, lineHeight: 19, marginTop: 18, marginHorizontal: 2 },
});
