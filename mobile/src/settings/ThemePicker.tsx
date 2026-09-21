import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { accentIds, accents, palettes, useTheme, type AccentId } from '../theme';
import { Icon } from '../ui/primitives';
import type { ThemePreference } from '../ui/types';
import { Group, Row } from './SettingsRows';

const appearances: { id: ThemePreference; title: string }[] = [
  { id: 'system', title: 'System' }, { id: 'light', title: 'Light' }, { id: 'dark', title: 'Dark' },
];

/**
 * Appearance and accent, set right in the list: they are the settings people play
 * with, and the whole app recolours as they tap, so a page of their own would only
 * hide the result. Each tile is a small drawing of the app in that theme, carrying
 * the chosen accent, so the three choices are told apart by looking.
 */
export function ThemePicker({ theme, accent, onTheme, onAccent }: {
  theme: ThemePreference; accent: AccentId; onTheme: (theme: ThemePreference) => void; onAccent?: (accent: AccentId) => void;
}) {
  const { colors, dark } = useTheme();
  return <Group>
    <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={s.tiles}>
      {appearances.map(item => {
        const on = theme === item.id;
        return <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.title} aria-checked={on}
          accessibilityState={{ checked: on }} onPress={() => onTheme(item.id)} style={s.tile}>
          <View style={[s.ring, { borderColor: on ? colors.accent : 'transparent' }]}>
            <Preview mode={item.id} accent={accent} />
          </View>
          <View style={s.caption}>
            {on && <Icon name="checkmark" size={13} color={colors.accent} />}
            <Text style={[s.captionText, { color: on ? colors.text : colors.muted }]}>{item.title}</Text>
          </View>
        </Pressable>;
      })}
    </View>
    {onAccent && <Row title="Accent" right={<View accessibilityRole="radiogroup" accessibilityLabel="Accent colour" style={s.swatches}>
      {accentIds.map(id => {
        const on = id === accent;
        const color = accents[id][dark ? 'dark' : 'light'].accent;
        return <Pressable key={id} accessibilityRole="radio" accessibilityLabel={accents[id].name} aria-checked={on}
          accessibilityState={{ checked: on }} hitSlop={6} onPress={() => onAccent(id)}
          style={[s.swatchRing, { borderColor: on ? color : 'transparent' }]}>
          <View style={[s.swatch, { backgroundColor: color }]} />
        </Pressable>;
      })}
    </View>} />}
  </Group>;
}

/** The app in miniature: a title bar, two lines of text and a button in the accent. */
function Preview({ mode, accent }: { mode: ThemePreference; accent: AccentId }) {
  const light = palettes.light, dark = palettes.dark;
  const ground = mode === 'light' ? light.background : dark.background;
  const line = mode === 'light' ? light.border : mode === 'dark' ? dark.border : 'rgba(128,136,150,0.55)';
  const pill = accents[accent][mode === 'light' ? 'light' : 'dark'].accent;
  return <View style={[s.preview, { backgroundColor: ground, borderColor: mode === 'light' ? light.border : dark.border }]}>
    {mode === 'system' && <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
      <Polygon points="0,0 100,0 0,100" fill={light.background} />
      <Polygon points="100,0 100,100 0,100" fill={dark.background} />
    </Svg>}
    <View style={[s.bar, { width: '58%', backgroundColor: line }]} />
    <View style={[s.bar, { width: '86%', backgroundColor: line }]} />
    <View style={[s.bar, { width: '44%', backgroundColor: line }]} />
    <View style={[s.pill, { backgroundColor: pill }]} />
  </View>;
}

const s = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 14 },
  tile: { flex: 1, alignItems: 'center', gap: 8 },
  ring: { alignSelf: 'stretch', borderRadius: 14, borderWidth: 2, padding: 2 },
  preview: { height: 72, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
    paddingHorizontal: 9, paddingVertical: 10, gap: 6 },
  bar: { height: 5, borderRadius: 3 },
  pill: { width: 34, height: 12, borderRadius: 6, marginTop: 'auto' },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 18 },
  captionText: { fontSize: 13, fontWeight: '500' },
  swatches: { flexDirection: 'row', gap: 8 },
  swatchRing: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 22, height: 22, borderRadius: 11 },
});
