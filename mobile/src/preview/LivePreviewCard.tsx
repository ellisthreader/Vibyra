import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import type { WorkspaceModel } from '../ui/types';
import { previewTargetMatchesProject, previewTargetRunning } from './targetMatch';

type Target = Awaited<
  ReturnType<NonNullable<WorkspaceModel['actions']['listPreviews']>>
>['targets'][number];

/** Only a running, Mac-authorized browser target earns space in the chat. */
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
  const [target, setTarget] = useState<Target | null>(null);
  const list = workspace.actions.listPreviews;
  const listing = useRef(list);
  listing.current = list;
  const projects = useRef(workspace.projects);
  projects.current = workspace.projects;
  useEffect(() => {
    setTarget(null);
    if (
      !active ||
      workspace.status !== 'connected' ||
      !workspace.previewAvailable ||
      !listing.current
    ) {
      setTarget(null);
      return;
    }
    let live = true;
    let pending = false;
    const read = () => {
      if (pending) return;
      pending = true;
      void listing.current!()
        .then((result) => {
          if (live)
            setTarget(
              result.targets.find(
                (item) =>
                  previewTargetMatchesProject(item, projectId, projects.current) &&
                  previewTargetRunning(item),
              ) ?? null,
            );
        })
        .catch(() => {
          if (live) setTarget(null);
        })
        .finally(() => {
          pending = false;
        });
    };
    read();
    const timer = setInterval(read, 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [active, projectId, workspace.host?.id, workspace.previewAvailable, workspace.status]);
  if (!target) return null;
  const detail = target.name ?? 'Running on your Mac';
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
        <Icon name="globe-outline" size={21} color={colors.accent} />
        <View style={[s.dot, { backgroundColor: colors.success, borderColor: colors.surface }]} />
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
