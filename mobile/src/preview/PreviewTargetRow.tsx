import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from '../ui/font';
import { Icon } from '../ui/primitives';
import type { HostNoun } from './hostNoun';
import { PreviewTile } from './PreviewTile';
import { previewAddress } from './targetMatch';
import type { PreviewTarget } from './types';

/** The Mac's generic name for a discovered site says less than its address does. */
const GENERIC = /^Current site on port \d+$/;

/** What a running site or app window is called, and the one line under it. */
export function previewTargetWords(target: PreviewTarget, noun: HostNoun): { title: string; detail: string; window: boolean } {
  const window = target.targetId.startsWith('native-window:');
  const address = previewAddress(target);
  const name = target.name && !GENERIC.test(target.name) ? target.name : null;
  if (window) {
    return { window, title: name ?? 'Desktop application',
      detail: target.approvalRequired ? 'App window · Tap to share' : 'App window' };
  }
  const where = [name && name !== address ? name : null, target.worktree ? 'agent worktree' : null].filter(Boolean);
  return { window, title: address ?? name ?? target.targetId,
    detail: ['Website', ...where].join(' · ') + (where.length ? '' : ` on your ${noun}`) };
}

/** A site or app window that is running now: one tap opens it. */
export function PreviewTargetRow({ target, noun, disabled, onPress }: {
  target: PreviewTarget; noun: HostNoun; disabled?: boolean; onPress(): void;
}) {
  const { colors } = useTheme();
  const { title, detail, window } = previewTargetWords(target, noun);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${target.approvalRequired ? 'Share' : 'Open'} ${title}`}
    accessibilityHint={detail} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.row, { backgroundColor: pressed ? colors.elevated : 'transparent', opacity: disabled ? 0.45 : 1 }]}>
    <PreviewTile icon={window ? 'desktop-outline' : 'globe-outline'} size={44} />
    <View style={s.text}>
      <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{title}</Text>
      <Text numberOfLines={1} style={[s.detail, { color: colors.muted }]}>{detail}</Text>
    </View>
    <View style={s.trail}><Icon name="chevron-forward" size={15} color={colors.muted} /></View>
  </Pressable>;
}

const s = StyleSheet.create({
  row: { minHeight: 72, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  title: { ...font.headline },
  detail: { ...font.footnote },
  trail: { opacity: 0.7 },
});
