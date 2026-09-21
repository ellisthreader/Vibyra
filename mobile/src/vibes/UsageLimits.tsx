import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { spanOf } from './plans';
import type { VibesLimits, VibesWindow } from './types';

/**
 * How fast this plan may spend, as the two rolling windows the backend enforces —
 * the 5 hours and the 7 days. Both are drawn whenever the backend publishes them.
 *
 * They used to be drawn only while one of them was what would stop the next send:
 * `available > limit - used`. The arithmetic was right and the question was wrong.
 * A free account holding three Vibes against a sixty-Vibe window never met that
 * condition, so the windows the plan is actually sold on were invisible to every
 * account small enough to care about them, and the first time anyone learned a rate
 * existed was when a send was refused. They are the shape of the plan, not an alarm:
 * shown always, they are read before sending rather than explained afterwards.
 *
 * Every figure is the wallet's, including how long each window is: a client that
 * writes "5 hours" of its own starts lying the first time that is retuned. A
 * backend publishing no windows renders nothing at all rather than a meter of
 * zeroes, which would read as "you have no allowance".
 *
 * Two rows, a label and a number each, and a bar. No heading over them: the balance
 * above already says what this page is about, and this area has rejected an eyebrow
 * label over every block once before. The rule at the top is the whole boundary the
 * block needs — a card around it would be the nested box Graphite and Cobalt asks
 * this app not to add.
 *
 * Each row reads "N of M", never "N left". The remainder on its own never revealed
 * what the allowance was, so there was no telling whether 200 left was nearly all
 * of a limit or nearly none of one — and "what is my limit" is the only question
 * this block exists to answer.
 *
 * The bar fills with what is **left**, not with what has been spent: a battery, not
 * a progress bar. Filling it with usage made a full bar bad news and an empty one
 * good, inverting every meter anyone has read before and disagreeing with the
 * figure printed beside it.
 */
export function UsageLimits({ limits }: { limits: VibesLimits }) {
  const { colors } = useTheme();
  // The countdown is read while the page stays open, so it moves with the clock
  // rather than freezing at whatever it said when the wallet arrived.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);
  return <View style={[s.block, { borderTopColor: colors.border }]}>
    {[limits.session, limits.week].map(w => <Meter key={w.unit} window={w} now={now} />)}
  </View>;
}

/**
 * When a window next gives Vibes back: "Resets in 3 hr 12 min" under a day, and
 * the phone's own day and time ("Resets Mon 14:20") beyond one. The server words
 * its refusal as a duration because it does not know the phone's timezone; the
 * phone does, so a week away is a day to plan around rather than "3 days".
 *
 * `resetsAt` is when the oldest spend in the window ages out, and it is null while
 * nothing is in the window. The line stays, saying only how long the window runs:
 * "Resets every 5 hours". It said "…after your next message" until that was asked
 * to go as more than the line needed.
 */
function resetLine(window: VibesWindow, now: number): string {
  const at = window.resetsAt ? new Date(window.resetsAt).getTime() : NaN;
  if (Number.isNaN(at)) return `Resets every ${spanOf(window)}`;
  const minutes = Math.ceil((at - now) / 60000);
  if (minutes <= 0) return 'Resetting now';
  if (minutes < 60) return `Resets in ${minutes} min`;
  if (minutes < 24 * 60) {
    const rest = minutes % 60;
    return `Resets in ${Math.floor(minutes / 60)} hr${rest ? ` ${rest} min` : ''}`;
  }
  return `Resets ${new Date(at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
}

function Meter({ window, now }: { window: VibesWindow; now: number }) {
  const { colors } = useTheme();
  const left = Math.max(0, window.limit - window.used);
  const share = Math.min(1, left / Math.max(1, window.limit));
  // One step of colour, at the point it stops being information and starts being
  // something to act on. A bar that reddens gradually says nothing at 60%.
  const bar = left === 0 ? colors.error : share < 0.15 ? colors.warning : colors.accent;
  // Shown under every window, full or not. It used to wait until a window held
  // something, and before that until it was empty, so the one fact people came
  // looking for — when does this come back — was missing whenever they looked early.
  const reset = resetLine(window, now);
  // "Next", not "Every": what someone is deciding is whether to send now, and the
  // window they are deciding against is the one ahead of them.
  const label = `Next ${spanOf(window)}`;
  return <View style={s.meter} accessibilityRole="progressbar"
    accessibilityLabel={`${label}, ${left.toLocaleString()} of ${window.limit.toLocaleString()} Vibes left. ${reset}`}
    accessibilityValue={{ min: 0, max: window.limit, now: left }}>
    <View style={s.row}>
      <Text style={[s.label, { color: colors.text }]}>{label}</Text>
      <Text style={[s.value, { color: left === 0 ? colors.error : colors.muted }]}>
        {left.toLocaleString()} of {window.limit.toLocaleString()}</Text>
    </View>
    <View style={[s.track, { backgroundColor: colors.elevated }]}>
      <View style={[s.fill, { backgroundColor: bar, width: `${Math.round(share * 100)}%` }]} />
    </View>
    {/* "Resets" was asked for by name over the earlier "Frees up in about". The
        window is rolling, so what returns at `resetsAt` is its oldest spend. */}
    <Text style={[s.note, { color: colors.muted }]}>{reset}</Text>
  </View>;
}
const s = StyleSheet.create({
  block: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 18, gap: 16 },
  meter: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 15, fontWeight: '500', letterSpacing: -0.2 },
  value: { fontSize: 14, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  note: { fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
});
