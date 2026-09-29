import { StyleSheet, View } from 'react-native';
import { Footnote, Label } from '../settings/SettingsRows';
import { usePreviewHostNoun } from './hostNoun';
import { PreviewRunRow } from './PreviewRunRow';
import { Reveal } from './Reveal';
import type { PreviewRunnable } from './runnable';
import { runViewTarget } from './runOpen';
import type { PreviewTarget } from './types';
import type { RunActions } from './useRunControl';

/** A project's desktop apps, run on the computer from here. Nothing runs without
 *  a tap on the exact command shown; a changed command asks again. Each app is its
 *  own card, and the one line that applies to all of them sits under the last. */
export function PreviewRunPanel({ rows, targets, actions, disabled, first, onChanged, onOpen }: {
  rows: PreviewRunnable[]; targets: PreviewTarget[]; actions: RunActions; disabled?: boolean;
  /** No section above this one, so it starts at the top. */
  first?: boolean;
  /** Read the list again: the computer's rows carry the run's progress. */
  onChanged(): void;
  onOpen(target: PreviewTarget): void;
}) {
  const noun = usePreviewHostNoun();
  return <View testID="preview-run-panel">
    <Label first={first}>Run this project’s app</Label>
    <View style={s.cards}>
      {rows.map((row, index) => {
        const view = runViewTarget(row, targets);
        return <Reveal key={`${row.projectId}:${row.targetId}`} delay={index * 70}>
          <PreviewRunRow row={row} actions={actions} disabled={disabled}
            canView={Boolean(view)} onChanged={onChanged} onView={() => view && onOpen(view)} />
        </Reveal>;
      })}
    </View>
    <Footnote>Runs on your {noun}, outside the agent sandbox. Its window opens here when it appears, and you can tap and type in it.</Footnote>
  </View>;
}

const s = StyleSheet.create({
  cards: { gap: 12 },
});
