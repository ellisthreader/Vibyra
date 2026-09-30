import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon, type IconName } from './primitives';

/**
 * The rail's one row, and the only row it draws.
 *
 * A destination, a project, a terminal and a chat are the same object in this
 * column: one height, one inset, one radius, one icon slot, one type size. It is
 * how Vibyra on the computer draws its navigation strip, and the reason that
 * column reads as a single list rather than several stacked panels.
 *
 * Selection is the fill and a full-strength icon — never an accent glyph and
 * never an edge marker. Tinting one row's icon made the open terminal read as a
 * different kind of item to the project holding it.
 *
 * The trailing slot holds the state dot, and the dot means one thing across the
 * app: green is working, amber is waiting on you, red is stopped short, and a
 * thing at rest shows nothing at all, so one glance down the rail says what is
 * still alive and what needs a hand. A row that folds — a project, and nothing
 * else — puts its chevron after that dot.
 */
export type RailState = 'running' | 'input' | 'stopped' | null;

export function RailRow({
  icon,
  mark,
  label,
  detail,
  selected = false,
  state = null,
  expanded,
  indented = false,
  faded = false,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  onLongPress,
}: {
  icon?: IconName;
  label: string;
  selected?: boolean;
  state?: RailState;
  expanded?: boolean;
  /** What it names is away: the row is read, not entered, and drawn quieter. */
  faded?: boolean;
  /** Holding the row, for what can be done to the thing it names. */
  onLongPress?: () => void;
  /** The row's own leading mark — an agent's brand tile — in place of a glyph. */
  mark?: ReactNode;
  /** A second, quieter line: who is working here and how it is going. */
  detail?: string;
  /** A terminal under its project. The row is the same; only where it starts changes. */
  indented?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected, expanded }}
      aria-selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={onLongPress ? 400 : undefined}
      style={({ pressed }) => [
        s.row,
        indented && s.indented,
        detail !== undefined && s.tall,
        {
          backgroundColor: selected || pressed ? colors.elevated : 'transparent',
          opacity: faded ? 0.62 : 1,
        },
      ]}
    >
      {mark ?? (
        <View style={s.icon}>
          <Icon
            name={icon ?? 'ellipse-outline'}
            size={19}
            color={selected ? colors.text : colors.muted}
          />
        </View>
      )}
      <View style={s.text}>
        <Text numberOfLines={1} style={[s.label, { color: colors.text }]}>
          {label}
        </Text>
        {detail !== undefined && (
          <Text
            numberOfLines={1}
            style={[s.detail, { color: state === 'input' ? colors.warning : colors.muted }]}
          >
            {detail}
          </Text>
        )}
      </View>
      <View style={s.trail}>{state && <RailDot state={state} />}</View>
      {expanded !== undefined && (
        <Icon name={expanded ? 'chevron-down' : 'chevron-forward'} size={13} color={colors.muted} />
      )}
    </Pressable>
  );
}

/** Projects and terminals report state through the same dot in the same slot. */
export function RailDot({ state }: { state: Exclude<RailState, null> }) {
  const { colors } = useTheme();
  const tone =
    state === 'running' ? colors.success : state === 'input' ? colors.warning : colors.error;
  return (
    <View
      style={[
        s.dot,
        { backgroundColor: tone },
        state === 'input' && { shadowColor: tone, shadowOpacity: 0.9, shadowRadius: 4 },
      ]}
    />
  );
}

/** A section is named by a quiet label and never carries its own button: an action
 *  in this column is a row, because a row is the thing the column already draws. */
export function RailSection({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[s.section, { color: colors.muted }]}>
      {children}
    </Text>
  );
}

/** What a section says when it has nothing in it: one quiet line, never a panel. */
export function RailNote({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[s.note, { color: colors.muted }]}>{children}</Text>;
}

/** The rows of one section, at the column's own inset. */
export function RailGroup({ children }: { children: ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

const s = StyleSheet.create({
  row: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // Terminals start under their project's name, so the tree is read from the
  // text column rather than from a rule drawn beside it.
  indented: { marginLeft: 18 },
  tall: { minHeight: 56, paddingVertical: 7 },
  icon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 15, fontWeight: '500', letterSpacing: -0.2 },
  detail: { fontSize: 12.5, lineHeight: 16 },
  trail: { width: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  section: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 8,
  },
  note: { fontSize: 13, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 7 },
  group: { paddingHorizontal: 12, gap: 2 },
});
