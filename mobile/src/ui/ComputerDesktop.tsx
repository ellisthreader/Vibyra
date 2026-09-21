import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandMark, Icon, type IconName } from './primitives';

type Caret = Animated.AnimatedInterpolation<number> | number;
type Output = { width: number; mark?: 'accent' | 'success' | 'muted'; passed?: boolean };

/**
 * The screen of a connected computer: Vibyra Desktop, up and working. It is the
 * real app (`desktop-tauri`) at a glance's resolution — the titlebar with the
 * mark, the project and the accent status dot; the left column with search,
 * projects and a Terminals list carrying their state dots; and the stage of
 * agent panes, the focused one ringed in accent with a caret ticking at its
 * prompt. Around it the platform stays legible: traffic lights on a Mac, window
 * controls on anything else, and Windows keeps its taskbar along the bottom.
 */
export function ComputerDesktop({ logo, caret }: { logo: IconName; caret: Caret }) {
  const { colors } = useTheme();
  const mac = logo === 'logo-apple';
  const edge = { borderColor: colors.border };
  return <View style={s.desktop}>
    <View style={[s.chrome, edge, { backgroundColor: colors.rail }]}>
      <View style={s.brand}>
        {mac && lights.map(color => <View key={color} style={[s.light, { backgroundColor: color }]} />)}
        <BrandMark size={9} />
        <Text allowFontScaling={false} numberOfLines={1} style={[s.wordmark, { color: colors.text }]}>Vibyra</Text>
      </View>
      <View style={s.context}>
        <Bar width={38} color={colors.muted} opacity={0.45} />
        <View style={s.grow} />
        <View style={[s.stat, { backgroundColor: colors.accentSoft }]}>
          <View style={[s.statDot, { backgroundColor: colors.accent }]} />
        </View>
        {!mac && (['remove', 'square-outline', 'close'] as const).map(name =>
          <Icon key={name} name={name} size={6} color={colors.muted} />)}
      </View>
    </View>
    <View style={s.body}>
      <View style={[s.rail, edge, { backgroundColor: colors.rail }]}>
        <View style={[s.search, { backgroundColor: colors.elevated }]} />
        <Row width={0.7} selected />
        <Row width={0.5} />
        <View style={s.section}><Bar width={16} color={colors.muted} opacity={0.35} /></View>
        <Row width={0.62} dot={colors.success} />
        <Row width={0.46} dot={colors.success} />
        <Row width={0.54} dot={colors.warning} />
      </View>
      <View style={[s.stage, { backgroundColor: colors.border }]}>
        <Pane number="1" output={ran} caret={caret} />
        <Pane number="2" output={working} />
      </View>
    </View>
    {logo === 'logo-windows' && <View style={[s.taskbar, edge, { backgroundColor: colors.surface }]}>
      <Icon name="logo-windows" size={7} color={colors.accent} />
      <View style={s.running}>
        <BrandMark size={7} />
        <View style={[s.underline, { backgroundColor: colors.accent }]} />
      </View>
    </View>}
  </View>;
}

// An agent's terminal mid-task, as the panes really read: a step it ran, what
// that printed, a check passing, the next edit; and beside it another agent
// still working. A zero-width line is a blank one, which real output has.
const ran: Output[] = [{ mark: 'accent', width: 0.8 }, { width: 0.52 }, { width: 0.66, passed: true }, { width: 0 },
  { mark: 'muted', width: 0.6 }, { width: 0.74 }, { width: 0.4 }];
const working: Output[] = [{ mark: 'accent', width: 0.72 }, { width: 0.46 }, { width: 0.58 }, { width: 0 },
  { mark: 'accent', width: 0.64 }, { width: 0.5 }, { mark: 'success', width: 0.38 }];
// The platform's own colours, not the app's: this is what makes the window a Mac's.
const lights = ['#FF5F57', '#FEBC2E', '#28C840'];

/** One pane: its numbered header and working dot, output, and the input line —
 *  a ticking caret where you would type, a placeholder in the other. */
function Pane({ number, output, caret }: { number: string; output: Output[]; caret?: Caret }) {
  const { colors } = useTheme();
  return <View style={[s.pane, { backgroundColor: colors.workspace }]}>
    <View style={[s.head, { backgroundColor: colors.rail, borderColor: colors.border }]}>
      <View style={[s.badge, { backgroundColor: colors.accentSoft }]}>
        <Text allowFontScaling={false} style={[s.number, { color: colors.accent }]}>{number}</Text>
      </View>
      <Bar width={caret === undefined ? 20 : 26} color={colors.text} opacity={0.72} />
      <View style={s.grow} />
      <View style={[s.dot, { backgroundColor: colors.success }]} />
    </View>
    <View style={s.output}>
      {output.map((row, index) => <View key={index} style={[s.line, !row.mark && s.indent]}>
        {row.mark && <View style={[s.mark, { backgroundColor: colors[row.mark] }]} />}
        <View style={s.grow}><Bar width={`${row.width * 100}%`} color={row.passed ? colors.success : colors.muted}
          opacity={row.passed ? 0.8 : row.mark ? 0.6 : 0.35} /></View>
      </View>)}
    </View>
    <View style={[s.prompt, { backgroundColor: colors.elevated }]}>
      <Icon name="chevron-forward" size={7} color={colors.accent} />
      {caret === undefined ? <Bar width={30} color={colors.muted} opacity={0.3} />
        : <Animated.View style={[s.caret, { backgroundColor: colors.accent, opacity: caret }]} />}
    </View>
    {caret !== undefined && <View style={[StyleSheet.absoluteFill, s.ring, { borderColor: colors.accent }]} />}
  </View>;
}

/** A sidebar row: its icon, its name, and for a terminal the state dot. */
function Row({ width, selected, dot }: { width: number; selected?: boolean; dot?: string }) {
  const { colors } = useTheme();
  const ink = selected ? colors.text : colors.muted;
  return <View style={[s.row, selected && { backgroundColor: colors.elevated }]}>
    <View style={[s.glyph, { borderColor: ink, opacity: selected ? 0.8 : 0.5 }]} />
    <View style={s.grow}><Bar width={`${width * 100}%`} color={ink} opacity={selected ? 0.72 : 0.45} /></View>
    {dot && <View style={[s.dot, { backgroundColor: dot }]} />}
  </View>;
}

function Bar({ width, color, opacity }: { width: number | `${number}%`; color: string; opacity: number }) {
  return <View style={[s.bar, { width, backgroundColor: color, opacity }]} />;
}

const s = StyleSheet.create({
  desktop: { flex: 1 }, grow: { flex: 1 },
  chrome: { height: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  // The brand block is exactly as wide as the column under it, as in the app.
  brand: { width: '28%', flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 6 },
  light: { width: 4, height: 4, borderRadius: 2 },
  wordmark: { fontSize: 7, lineHeight: 9, fontWeight: '700', letterSpacing: -0.1, flexShrink: 1 },
  context: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  stat: { width: 8, height: 8, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: 2 },
  statDot: { width: 4, height: 4, borderRadius: 2 },
  body: { flex: 1, flexDirection: 'row' },
  rail: { width: '28%', borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4, paddingTop: 5, gap: 2 },
  search: { height: 7, borderRadius: 3, marginBottom: 3 },
  row: { height: 9, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 3, borderRadius: 3 },
  glyph: { width: 4, height: 4, borderRadius: 1, borderWidth: 1 },
  section: { paddingHorizontal: 3, paddingTop: 4, paddingBottom: 1 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  bar: { height: 3, borderRadius: 1.5 },
  stage: { flex: 1, flexDirection: 'row', gap: 1 },
  pane: { flex: 1 },
  head: { height: 12, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth },
  badge: { width: 7, height: 7, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 5, lineHeight: 7, height: 7, textAlign: 'center', fontWeight: '800' },
  output: { flex: 1, paddingHorizontal: 5, paddingTop: 7, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  indent: { paddingLeft: 6 },
  mark: { width: 3, height: 3, borderRadius: 1.5 },
  prompt: { height: 12, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  caret: { width: 4, height: 7, borderRadius: 1 },
  ring: { borderWidth: 1, opacity: 0.75 },
  taskbar: { height: 12, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 7,
    borderTopWidth: StyleSheet.hairlineWidth },
  running: { alignItems: 'center', gap: 1 },
  underline: { width: 5, height: 1, borderRadius: 1 },
});
