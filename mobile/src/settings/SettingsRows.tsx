import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, type IconName } from '../ui/primitives';

/**
 * The parts every Settings page is built from. Text first: a heading in the text
 * colour names each card, rows carry no icon column, and the value on the right
 * answers the row so most rows are read rather than opened. Structure is one card
 * per group with a hairline between rows, drawn from the text column so the rules
 * and the words share one left edge. Colour is kept for the selection, a switch that
 * is on, a link, a status dot, and the one destructive action.
 */
export function Label({ children, first }: { children: ReactNode; first?: boolean }) {
  const { colors } = useTheme();
  return <Text accessibilityRole="header" style={[s.label, first && s.first, { color: colors.text }]}>{children}</Text>;
}

/** One card of rows. `inset` is where each hairline starts; by default the text column. */
export function Group({ children, inset = 16, style }: { children: ReactNode; inset?: number; style?: object }) {
  const { colors } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  if (!rows.length) return null;
  return <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
    {rows.map((row, index) => <Fragment key={row.key ?? index}>
      {index > 0 && <View style={[s.rule, { marginLeft: inset, backgroundColor: colors.border }]} />}
      {row}
    </Fragment>)}
  </View>;
}

type Trailing = 'chevron' | 'external' | 'none';
/** `icon` is for a mark that is the choice itself (Apple, Google), never decoration.
 *  `dot` is a status colour drawn before the value; `label` replaces the spoken
 *  "title, value" when the dot's meaning has to be said in words too. */
export function Row({ title, icon, value, dot, label, detail, onPress, trailing = onPress ? 'chevron' : 'none', right, danger, busy, disabled, testID }: {
  title: string; icon?: IconName; value?: string | null; dot?: string; label?: string; detail?: string; onPress?: () => void;
  trailing?: Trailing; right?: ReactNode; danger?: boolean; busy?: boolean; disabled?: boolean; testID?: string;
}) {
  const { colors } = useTheme();
  const content = <>
    {icon && <Icon name={icon} size={20} color={colors.text} />}
    <View style={[s.text, danger && s.center]}>
      <Text numberOfLines={2} style={[s.title, { color: danger ? colors.error : colors.text }, danger && s.dangerTitle]}>{title}</Text>
      {detail && <Text style={[s.detail, { color: colors.muted }]}>{detail}</Text>}
    </View>
    {value ? <View style={s.valueRow}>
      {dot && <View style={[s.dot, { backgroundColor: dot }]} />}
      <Text numberOfLines={1} style={[s.value, { color: colors.muted }]}>{value}</Text>
    </View> : null}
    {right}
    {busy ? <ActivityIndicator size="small" color={colors.muted} />
      : trailing === 'chevron' ? <View style={s.trail}><Icon name="chevron-forward" size={15} color={colors.muted} /></View>
        : trailing === 'external' ? <View style={s.trail}><Icon name="open-outline" size={16} color={colors.muted} /></View> : null}
  </>;
  if (!onPress) return <View testID={testID} style={[s.row, detail && s.tall]}>{content}</View>;
  return <Pressable testID={testID} accessibilityRole={trailing === 'external' ? 'link' : 'button'}
    accessibilityLabel={label ?? (value ? `${title}, ${value}` : title)} aria-disabled={disabled || busy}
    accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [s.row, detail && s.tall, { backgroundColor: pressed ? colors.elevated : 'transparent',
      opacity: disabled ? 0.45 : 1 }]}>
    {content}
  </Pressable>;
}

/** A setting that is on or off. The switch is the control, named by the row's title. */
export function SwitchRow({ title, detail, value, onChange, disabled }: {
  title: string; detail?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean;
}) {
  const { colors } = useTheme();
  // react-native-web draws an "on" knob in its own teal unless told otherwise; the
  // native props below have no word for it, so it rides along untyped.
  const webKnob = { activeThumbColor: colors.onAction } as object;
  return <Row title={title} detail={detail} right={<Switch accessibilityLabel={title} value={value} disabled={disabled}
    onValueChange={onChange} trackColor={{ true: colors.action, false: colors.border }}
    thumbColor={value ? colors.onAction : '#FFFFFF'} ios_backgroundColor={colors.border} {...webKnob} />} />;
}

/** At most one per page, under the card it qualifies. */
export function Footnote({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[s.footnote, { color: colors.muted }]}>{children}</Text>;
}

const s = StyleSheet.create({
  label: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, marginTop: 28, marginBottom: 8, marginLeft: 2 },
  first: { marginTop: 8 },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  rule: { height: StyleSheet.hairlineWidth },
  row: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tall: { minHeight: 62, paddingVertical: 10 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  center: { alignItems: 'center' },
  title: { fontSize: 16, letterSpacing: -0.2 },
  dangerTitle: { fontWeight: '600', textAlign: 'center' },
  detail: { fontSize: 13, lineHeight: 18 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1, maxWidth: '55%' },
  value: { fontSize: 15, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  dot: { width: 7, height: 7, borderRadius: 4 },
  trail: { opacity: 0.7 },
  footnote: { fontSize: 13, lineHeight: 19, marginTop: 10, marginHorizontal: 2 },
});
