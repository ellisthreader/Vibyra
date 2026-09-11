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
  return <View style={[s.block, { borderTopColor: colors.border }]}>
    {[limits.session, limits.week].map(w => <Meter key={w.unit} window={w} />)}
  </View>;
}

/**
 * "in about 2 hours". A rolling window frees up when its oldest spend ages out,
 * so this is a duration rather than a clock time — the same wording the server
 * uses when it refuses a send, so the two never appear to disagree.
 */
function freesUp(iso: string | null): string | null {
  const at = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(at)) return null;
  const minutes = Math.ceil((at - Date.now()) / 60000);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  return hours < 48 ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : `${Math.ceil(hours / 24)} days`;
}

function Meter({ window }: { window: VibesWindow }) {
  const { colors } = useTheme();
  const left = Math.max(0, window.limit - window.used);
  const share = Math.min(1, left / Math.max(1, window.limit));
  // One step of colour, at the point it stops being information and starts being
  // something to act on. A bar that reddens gradually says nothing at 60%.
  const bar = left === 0 ? colors.error : share < 0.15 ? colors.warning : colors.accent;
  // Shown whenever anything is in the window, not only once it is empty. Waiting
  // until 0 meant the one fact people came looking for — when does this come back —
  // only ever appeared at the moment it was too late to plan around.
  const waiting = freesUp(window.resetsAt);
  // "Next", not "Every": what someone is deciding is whether to send now, and the
  // window they are deciding against is the one ahead of them.
  const label = `Next ${spanOf(window)}`;
  return <View style={s.meter} accessibilityRole="progressbar"
    accessibilityLabel={`${label}, ${left.toLocaleString()} of ${window.limit.toLocaleString()} Vibes left`}
    accessibilityValue={{ min: 0, max: window.limit, now: left }}>
    <View style={s.row}>
      <Text style={[s.label, { color: colors.text }]}>{label}</Text>
      <Text style={[s.value, { color: left === 0 ? colors.error : colors.muted }]}>
        {left.toLocaleString()} of {window.limit.toLocaleString()}</Text>
    </View>
    <View style={[s.track, { backgroundColor: colors.elevated }]}>
      <View style={[s.fill, { backgroundColor: bar, width: `${Math.round(share * 100)}%` }]} />
    </View>
    {/* "Frees up", not "resets": a rolling window returns the oldest spend in it
        rather than emptying, so `resetsAt` is when capacity starts coming back and
        promising a reset would overstate it. */}
    {waiting && <Text style={[s.note, { color: colors.muted }]}>Frees up in about {waiting}</Text>}
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
  note: { fontSize: 13, lineHeight: 18 },
});
