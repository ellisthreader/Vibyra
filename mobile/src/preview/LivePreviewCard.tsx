import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { previewHostNoun, type HostNoun } from './hostNoun';
import { previewAddress } from './targetMatch';
import { ACTIVE_RUN } from './runnable';
import { runCardText } from './RunStatusLine';
import { usePreviewListing, type LivePreviewTarget } from './useLivePreviewTarget';
import { useRunAutoOpen } from './useRunAutoOpen';

/** Native candidates offer an explicit sharing step before capture begins. A desktop
 *  app the computer can run shows its run here, and its window opens by itself once. */
export function LivePreviewCard({
  workspace,
  projectId,
  active = true,
  onPress,
}: {
  workspace: WorkspaceModel;
  projectId: string;
  active?: boolean;
  onPress(): void;
}) {
  const { colors } = useTheme();
  const listing = usePreviewListing(workspace, projectId, active);
  useRunAutoOpen(workspace, listing, onPress, active);
  const { target } = listing;
  const run = listing.runnables.find(row => ACTIVE_RUN.includes(row.runState));
  // Nothing running: offer the project's app, which opens the sheet on its Run panel.
  const idle = !target && !run ? listing.runnables[0] : undefined;
  const shown = run ?? idle;
  if (!target && !shown) return null;
  const native = Boolean(shown) || Boolean(target?.targetId.startsWith('native-window:'));
  const detail = shown ? (run ? `${run.name} · ${runCardText(run)}` : runCardText(shown)) : targetDetail(target!, previewHostNoun(workspace));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Live preview. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[s.glyph, { backgroundColor: colors.elevated }]}>
        <Icon name={native ? 'desktop-outline' : 'globe-outline'} size={21} color={colors.accent} />
        <View style={[s.dot, { backgroundColor: idle ? colors.muted : run && run.runState !== 'ready' || target?.approvalRequired ? colors.accent : colors.success, borderColor: colors.surface }]} />
      </View>
      <View style={s.copy}>
        <Text style={[s.title, { color: colors.text }]}>Live preview</Text>
        <Text numberOfLines={1} style={[s.detail, { color: colors.muted }]}>
          {detail}
        </Text>
      </View>
      <Icon name="open-outline" size={18} color={colors.accent} />
    </Pressable>
  );
}

function targetDetail(target: LivePreviewTarget, noun: HostNoun): string {
  const address = previewAddress(target);
  return target.approvalRequired ? `${target.name ?? 'Desktop application'} · Tap to share this window` : address
    ? `${address}${target.worktree ? ' · agent worktree' : ''} is running on your ${noun}`
    : `${target.name ?? 'Application'} · Running on your ${noun}`;
}

const s = StyleSheet.create({
  card: {
    minHeight: 64,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    right: 2,
    bottom: 2,
  },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  detail: { fontSize: 12, lineHeight: 16 },
});
