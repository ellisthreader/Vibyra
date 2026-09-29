import { ScrollView, StyleSheet } from 'react-native';
import { Group, Label } from '../settings/SettingsRows';
import { GUTTER } from '../ui/font';
import { usePreviewHostNoun } from './hostNoun';
import { CARD_RADIUS } from './previewCard';
import { PreviewRunPanel } from './PreviewRunPanel';
import { PreviewTargetRow } from './PreviewTargetRow';
import { Reveal } from './Reveal';
import type { PreviewRunnable } from './runnable';
import { runViewTarget } from './runOpen';
import type { PreviewTarget } from './types';
import type { RunActions } from './useRunControl';

/** Everything this project can show on the phone, in one scroll: what is running now,
 *  then the apps the computer can run. A window an app's card already offers to View
 *  is not listed twice. */
export function PreviewChooser({ targets, runs, actions, connected, onOpen, onChanged }: {
  targets: PreviewTarget[]; runs: PreviewRunnable[]; actions: RunActions; connected: boolean;
  onOpen(target: PreviewTarget): void; onChanged(): void;
}) {
  const noun = usePreviewHostNoun();
  const claimed = new Set(runs.map(row => runViewTarget(row, targets)?.grantId));
  const running = targets.filter(target => !claimed.has(target.grantId));
  return <ScrollView testID="preview-chooser" contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    {running.length > 0 && <Reveal>
      <Label first>Running now</Label>
      <Group inset={74} style={s.group}>
        {running.map(target => <PreviewTargetRow key={target.grantId} target={target} noun={noun}
          disabled={!connected} onPress={() => onOpen(target)} />)}
      </Group>
    </Reveal>}
    {runs.length > 0 && <PreviewRunPanel rows={runs} targets={targets} actions={actions}
      first={running.length === 0} disabled={!connected} onChanged={onChanged} onOpen={onOpen} />}
  </ScrollView>;
}

const s = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: 40 },
  group: { borderRadius: CARD_RADIUS },
});
