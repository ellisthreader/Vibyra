import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import { Mark } from '../ui/BrandLogo';
import { Icon, type IconName } from '../ui/primitives';
import { useReducedMotion } from '../ui/useReducedMotion';
import { integrationBrand } from '../integrations/integrationBrands';
import type { Integration } from '../integrations/types';
import { useGlass } from './glass';

export interface Anchor { x: number; y: number; width: number; height: number }

/**
 * What the composer's + adds, opened right above it: a photo from the camera or
 * the library, a file, a connected app to mention, or a project where the computer
 * can serve one. It grows out of the + itself and folds back into it, so it reads
 * as part of the composer rather than as a screen laid over it.
 *
 * A picker is only opened once this has finished closing: iOS will not present
 * one view controller while another is still being dismissed.
 */
export function AttachMenu({ anchor, onClose, onCamera, onPhotos, onFiles, apps, onMention, onProject, onConnectApps, full }: {
  anchor: Anchor | null; onClose(): void; onCamera(): void; onPhotos(): void; onFiles(): void;
  apps: Integration[]; onMention(mention: string): void; onProject?(): void; onConnectApps?(): void; full: boolean;
}) {
  const { colors } = useTheme();
  const glass = useGlass();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [shown, setShown] = useState<Anchor | null>(anchor);
  const progress = useRef(new Animated.Value(0)).current;
  const next = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (anchor) {
      setShown(anchor);
      progress.setValue(0);
      if (reduced) progress.setValue(1);
      else Animated.spring(progress, { toValue: 1, damping: 20, stiffness: 320, mass: 0.8, useNativeDriver: true }).start();
      return;
    }
    Animated.timing(progress, { toValue: 0, duration: reduced ? 0 : 150, easing: Easing.in(Easing.quad), useNativeDriver: true })
      .start(() => { setShown(null); const action = next.current; next.current = null; if (action) setTimeout(action, 60); });
  }, [anchor]);
  if (!shown) return null;
  const then = (action: () => void) => () => { next.current = action; onClose(); };
  const panel = Math.min(320, width - 32);
  const left = Math.min(Math.max(16, shown.x - 6), width - panel - 16);
  return <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: Animated.multiply(progress, 0.55) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close attach menu" onPress={onClose} style={StyleSheet.absoluteFill} />
    </Animated.View>
    <Animated.View accessibilityViewIsModal onAccessibilityEscape={onClose} role="menu" aria-label="Add to chat"
      style={[s.panel, glass.sheet, { left, width: panel, bottom: height - shown.y + 10,
        opacity: progress, transformOrigin: 'bottom left',
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}>
      <View style={s.tiles}>
        <Tile icon="camera-outline" title="Camera" label="Take a photo" disabled={full} onPress={then(onCamera)} />
        <Tile icon="images-outline" title="Photos" label="Choose photos" disabled={full} onPress={then(onPhotos)} />
        <Tile icon="document-text-outline" title="Files" label="Choose files" disabled={full} onPress={then(onFiles)} />
      </View>
      {full && <Text style={[s.full, { color: colors.muted }]}>That’s the most one message can carry.</Text>}
      {(onProject || apps.length > 0 || onConnectApps) && <View style={[s.rule, { backgroundColor: colors.border }]} />}
      {onProject && <Row icon="folder-outline" title="Use a project" detail="Let the reply read and edit its files"
        label="Attach a project" onPress={then(onProject)} />}
      {apps.map(app => <Row key={app.id} mark={app.id} title={app.name} detail={`Ask with ${app.mention}`}
        label={`Mention ${app.name}`} onPress={then(() => onMention(app.mention))} />)}
      {onConnectApps && <Row icon="add-circle-outline" title={apps.length ? 'Connect another app' : 'Connect an app'}
        detail="GitHub, Stripe and more" label={apps.length ? 'Connect another app' : 'Connect an app'} onPress={then(onConnectApps)} />}
    </Animated.View>
  </Modal>;
}

function Tile({ icon, title, label, disabled, onPress }: { icon: IconName; title: string; label: string; disabled?: boolean; onPress(): void }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [s.tile, { backgroundColor: colors.elevated, opacity: disabled ? 0.4 : 1,
      transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
    <Icon name={icon} size={23} color={colors.text} />
    <Text style={[s.tileText, { color: colors.text }]}>{title}</Text>
  </Pressable>;
}

function Row({ icon, mark, title, detail, label, onPress }: {
  icon?: IconName; mark?: string; title: string; detail: string; label: string; onPress(): void;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [s.row, { backgroundColor: pressed ? colors.elevated : 'transparent' }]}>
    {mark ? <Mark brand={integrationBrand(mark)} size={30} />
      : <View style={[s.rowIcon, { backgroundColor: colors.elevated }]}><Icon name={icon!} size={16} color={colors.muted} /></View>}
    <View style={s.rowText}>
      <Text numberOfLines={1} style={[s.rowTitle, { color: colors.text }]}>{title}</Text>
      <Text numberOfLines={1} style={[s.rowDetail, { color: colors.muted }]}>{detail}</Text>
    </View>
  </Pressable>;
}
const s = StyleSheet.create({
  panel: { position: 'absolute', borderRadius: 26, padding: 8, gap: 4 },
  tiles: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, height: 78, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 7 },
  tileText: { fontSize: 12.5, fontWeight: '500' },
  full: { fontSize: 11.5, textAlign: 'center', paddingVertical: 4 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 4, marginHorizontal: 6 },
  row: { minHeight: 50, borderRadius: 14, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 }, rowTitle: { fontSize: 14, fontWeight: '500' }, rowDetail: { fontSize: 11.5 },
});
