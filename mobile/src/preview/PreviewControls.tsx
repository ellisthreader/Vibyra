import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Icon, type IconName } from '../ui/primitives';

const SIZE = 48;
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/** A browser-sized surface with one movable control; infrequent actions live below it. */
export function PreviewControls({ location, back, forward, onBack, onForward, onReload, onClose }: {
  location: string; back: boolean; forward: boolean;
  onBack(): void; onForward(): void; onReload(): void; onClose(): void;
}) {
  const { colors, dark } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const initial = { x: width - SIZE - 16, y: Math.round(height * 0.42) };
  const coords = useRef(initial);
  const bounds = useRef({ width, height, top: insets.top, bottom: insets.bottom });
  bounds.current = { width, height, top: insets.top, bottom: insets.bottom };
  const position = useRef(new Animated.ValueXY(initial)).current;
  const origin = useRef(initial);
  const progress = useRef(new Animated.Value(0)).current;
  const moveBy = (dx: number, dy: number) => {
    const b = bounds.current;
    const next = { x: clamp(coords.current.x + dx, 10, b.width - SIZE - 10),
      y: clamp(coords.current.y + dy, b.top + 10, b.height - b.bottom - SIZE - 10) };
    coords.current = next; position.setValue(next);
  };
  useEffect(() => {
    const next = { x: width - SIZE - 16, y: Math.round(height * 0.42) };
    coords.current = next; position.setValue(next);
  }, [width, height, position]);
  useEffect(() => {
    Animated.timing(progress, { toValue: menu ? 1 : 0, duration: 210, useNativeDriver: true }).start();
  }, [menu, progress]);
  const drag = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { origin.current = coords.current; },
    onPanResponderMove: (_, gesture) => {
      const b = bounds.current;
      const next = { x: clamp(origin.current.x + gesture.dx, 10, b.width - SIZE - 10),
        y: clamp(origin.current.y + gesture.dy, b.top + 10, b.height - b.bottom - SIZE - 10) };
      coords.current = next; position.setValue(next);
    },
    onPanResponderRelease: (_, gesture) => {
      origin.current = coords.current;
      if (Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) setMenu(true);
    },
    onPanResponderTerminationRequest: () => false,
  })).current;
  const action = (icon: IconName, title: string, onPress: () => void, disabled = false) =>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled}
      onPress={() => { setMenu(false); onPress(); }} style={({ pressed }) => [s.row, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}>
      <View style={[s.rowIcon, { backgroundColor: colors.elevated }]}><Icon name={icon} size={20} color={colors.text} /></View>
      <Text style={[s.rowText, { color: colors.text }]}>{title}</Text>
      <Icon name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>;
  return <>
    <Animated.View {...drag.panHandlers} accessible accessibilityRole="button" accessibilityLabel="Preview controls"
      accessibilityHint="Drag to move; tap for actions" onAccessibilityTap={() => setMenu(true)}
      accessibilityActions={[{ name: 'activate' }, { name: 'moveLeft', label: 'Move left' },
        { name: 'moveRight', label: 'Move right' }, { name: 'moveUp', label: 'Move up' },
        { name: 'moveDown', label: 'Move down' }]} onAccessibilityAction={event => {
        const action = event.nativeEvent.actionName;
        if (action === 'activate') setMenu(true);
        else if (action === 'moveLeft') moveBy(-64, 0);
        else if (action === 'moveRight') moveBy(64, 0);
        else if (action === 'moveUp') moveBy(0, -64);
        else if (action === 'moveDown') moveBy(0, 64);
      }} style={[s.floating, s.control, { transform: position.getTranslateTransform(),
        backgroundColor: colors.action, shadowOpacity: dark ? 0.5 : 0.25 }]}>
      <Icon name="settings-outline" size={23} color={colors.onAction} />
    </Animated.View>
    <View style={StyleSheet.absoluteFill} pointerEvents={menu ? 'auto' : 'none'}
      accessibilityElementsHidden={!menu} importantForAccessibility={menu ? 'auto' : 'no-hide-descendants'}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.38] }) }]} />
      <Pressable accessibilityLabel="Dismiss Preview controls" style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} />
      <Animated.View accessibilityViewIsModal style={[s.panel, { backgroundColor: colors.rail,
        paddingBottom: Math.max(insets.bottom, 14) + 12,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }] }]}>
        <View style={[s.grabber, { backgroundColor: colors.muted }]} />
        <Text style={[s.title, { color: colors.text }]}>Live preview</Text>
        <Text numberOfLines={1} style={[s.location, { color: colors.muted }]}>{location}</Text>
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {action('refresh-outline', 'Refresh', onReload)}
          <View style={[s.rule, { backgroundColor: colors.border }]} />
          {action('arrow-back-outline', 'Back', onBack, !back)}
          <View style={[s.rule, { backgroundColor: colors.border }]} />
          {action('arrow-forward-outline', 'Forward', onForward, !forward)}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close Live Preview" onPress={onClose}
          style={({ pressed }) => [s.close, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="close-outline" size={20} color={colors.error} />
          <Text style={[s.closeText, { color: colors.error }]}>Close preview</Text>
        </Pressable>
      </Animated.View>
    </View>
  </>;
}

const s = StyleSheet.create({
  floating: { position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE, borderRadius: SIZE / 2,
    shadowColor: '#000', shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 10 },
  control: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12, paddingHorizontal: 18, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 18 },
  grabber: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', opacity: 0.4, marginBottom: 19 },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  location: { fontSize: 13, marginTop: 3, marginBottom: 19 },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 17, overflow: 'hidden' },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600' },
  rule: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
  close: { minHeight: 54, borderWidth: StyleSheet.hairlineWidth, borderRadius: 17, marginTop: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  closeText: { fontSize: 15, fontWeight: '600' },
});
