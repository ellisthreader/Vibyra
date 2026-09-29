import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font, radius } from '../ui/font';
import { usePreviewHostNoun } from './hostNoun';
import { cardStyle, type CardTone } from './previewCard';
import { PreviewTile } from './PreviewTile';
import { Reveal } from './Reveal';
import { RunPill } from './RunPill';
import { RunProgress } from './RunProgress';
import { RunNotice, RunStatusLine } from './RunStatusLine';
import type { PreviewRunnable } from './runnable';
import { useRunControl, type RunActions } from './useRunControl';
import { useSoftLayout } from './useSoftLayout';

/** One desktop app the computer can run, as a card that grows with its run: the exact
 *  command and one action while it waits, a three-step bar while it starts, then View
 *  window once there is a window to see. */
export function PreviewRunRow({ row, actions, disabled, canView, onChanged, onView }: {
  row: PreviewRunnable; actions: RunActions; disabled?: boolean;
  /** There is a window to open: this run's own, or the project's only one. */
  canView: boolean; onChanged(): void; onView(): void;
}) {
  const { colors, dark } = useTheme();
  const noun = usePreviewHostNoun();
  const { run, shown, asks, prompt, busy, error, hint, active, failed, start, stop } = useRunControl({ row, actions, onChanged });
  const ready = run.runState === 'ready';
  const working = active && !ready;
  const retry = failed && !prompt;
  const tone: CardTone = retry ? 'failed' : ready ? 'ready' : working ? 'working' : 'idle';
  useSoftLayout(`${run.runState}:${canView}:${asks}:${Boolean(error)}:${Boolean(hint)}`);
  const last = run.logTail?.filter(line => line.trim()).at(-1)?.trim();
  return <View testID="preview-run-row" style={[s.card, cardStyle(colors, dark, tone)]}>
    <View style={s.head}>
      <PreviewTile icon={retry ? 'alert-circle' : ready ? 'checkmark-circle' : 'desktop-outline'}
        tone={retry ? 'error' : ready ? 'success' : 'accent'} size={44} />
      <View style={s.text}>
        <Text numberOfLines={2} style={[s.name, { color: colors.text }]}>{shown.name}</Text>
        {shown.command ? <Text selectable style={[s.command, { color: colors.muted }]}>{shown.command}</Text> : null}
      </View>
      {working && <RunPill title="Stop" label={`Stop ${shown.name}`} secondary busy={busy} disabled={disabled} onPress={() => void stop()} />}
      {!active && <RunPill title={retry ? 'Retry' : 'Run'} label={`${retry ? 'Retry' : 'Run'} ${shown.name} on your computer`}
        busy={busy} disabled={disabled || !actions.runPreview} onPress={() => void start()} />}
    </View>
    {working && <Reveal><RunProgress web={row.kind === 'web'} state={run.runState} name={shown.name} log={run.runState === 'building' ? last : null} /></Reveal>}
    {retry && <Reveal><RunStatusLine run={run} noun={noun} /></Reveal>}
    {asks && !active && <View style={[s.well, { backgroundColor: colors.elevated }]}>
      {shown.body ? <Text selectable style={[s.code, { color: colors.text }]}>{shown.body}</Text> : null}
      <Text style={[s.where, { color: colors.muted }]}>In {shown.cwd}</Text>
    </View>}
    {asks && !active && shown.changed && !hint && <RunNotice tone="warning" text="This command changed since you approved it." />}
    {hint ? <RunNotice tone="warning" text={hint} /> : null}
    {error ? <RunNotice tone="error" text={error} /> : null}
    {(ready || (active && canView)) && <Reveal style={s.finish}>
      {ready && <RunStatusLine run={run} noun={noun} />}
      <View style={s.actions}>
        {canView && <RunPill wide grow={2} title={row.kind === 'web' ? 'View website' : 'View window'} icon={row.kind === 'web' ? 'globe-outline' : 'desktop-outline'} disabled={disabled} onPress={onView} />}
        {ready && <RunPill wide secondary title="Stop" label={`Stop ${shown.name}`} busy={busy} disabled={disabled} onPress={() => void stop()} />}
      </View>
    </Reveal>}
  </View>;
}

const s = StyleSheet.create({
  card: { padding: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...font.headline },
  command: { fontFamily: 'Menlo', fontSize: 12, lineHeight: 17 },
  well: { borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, gap: 4 },
  code: { fontFamily: 'Menlo', fontSize: 12.5, lineHeight: 18 },
  where: { ...font.footnote },
  finish: { gap: 12 },
  actions: { flexDirection: 'row', gap: 10 },
});
