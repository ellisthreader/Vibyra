import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font, radius } from '../ui/font';
import { Icon } from '../ui/primitives';
import type { PreviewRunnable, RunState } from './runnable';

type RunProgress = Pick<PreviewRunnable, 'runState' | 'logTail' | 'error' | 'stage'>;
export const FAILED_RUN: readonly RunState[] = ['failed', 'exited', 'timed_out'];

/** The Preview sheet's words for where a run is. */
export function runStatusText(run: RunProgress): string {
  const last = run.logTail?.filter(line => line.trim()).at(-1)?.trim();
  switch (run.runState) {
    case 'building': return `Building…${last ? ` ${last}` : ''}`;
    case 'waiting_for_window': return 'Waiting for the window…';
    case 'ready': return 'Running on your computer';
    case 'failed': return run.error || 'The app could not start.';
    case 'exited': return run.error || 'The app closed before its window opened.';
    case 'timed_out': return run.error || 'The app’s window did not open in time.';
    case 'stopped': return 'Stopped';
    default: return '';
  }
}

/** The shorter words the Live preview card uses in a chat. */
export function runCardText(run: Pick<PreviewRunnable, 'runState' | 'name'>): string {
  switch (run.runState) {
    case 'building': return 'Building your app…';
    case 'waiting_for_window': return 'Waiting for its window';
    case 'ready': return 'Ready · Tap to view';
    default: return `Run ${run.name}`;
  }
}

/** A soft note that cannot be missed: red for what went wrong, amber for what needs a decision. */
export function RunNotice({ text, tone }: { text: string; tone: 'error' | 'warning' }) {
  const { colors } = useTheme();
  const ink = tone === 'error' ? colors.error : colors.warning;
  return <View accessibilityLiveRegion="polite" style={[s.notice, { backgroundColor: tone === 'error' ? colors.errorSoft : `${colors.warning}1F` }]}>
    <Icon name={tone === 'error' ? 'alert-circle' : 'information-circle'} size={17} color={ink} />
    <Text accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[s.text, { color: ink }]}>{text}</Text>
  </View>;
}

/** The outcome of a run: running (a green dot) or why it stopped (a soft red note). */
export function RunStatusLine({ run, noun = 'computer' }: { run: RunProgress; noun?: string }) {
  const { colors } = useTheme();
  const text = run.runState === 'ready' ? `Running on your ${noun}` : runStatusText(run);
  if (!text) return null;
  if (FAILED_RUN.includes(run.runState)) return <RunNotice tone="error" text={text} />;
  const ready = run.runState === 'ready';
  return <View accessibilityLiveRegion="polite" style={s.row}>
    {ready && <View style={[s.dot, { backgroundColor: colors.success }]} />}
    <Text numberOfLines={2} style={[s.text, { color: ready ? colors.success : colors.muted, fontWeight: ready ? '500' : '400' }]}>{text}</Text>
  </View>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radius.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { ...font.footnote, flex: 1 },
});
