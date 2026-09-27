import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { font } from '../ui/font';
import { Icon, type IconName } from '../ui/primitives';
import type { AgentItem } from '../state/conversationTypes';
import { durationLabel } from './inspection';
import { groupSummary, stepLabel, type StepKind } from './stepLabel';
import type { ConversationActivity } from './types';

const ICONS: Record<StepKind, IconName> = {
  command: 'terminal-outline', read: 'document-text-outline', search: 'search-outline',
  list: 'folder-open-outline', edit: 'create-outline', web: 'globe-outline',
  think: 'bulb-outline', plan: 'list-outline', tool: 'extension-puzzle-outline',
};
/** Up to this many steps show as they are; more fold under one summary line. */
const OPEN_UP_TO = 3;

/**
 * The steps an agent took between two things it said. Each names what it
 * touched; a longer run folds under a summary ("Explored 5 files · ran 2
 * commands"), and while the agent works, the step in progress stays in view.
 */
export function ActivityGroup({ items, expanded, onToggle, onInspect, stepMemory, live }: {
  items: ConversationActivity[];
  expanded: boolean;
  onToggle: () => void;
  onInspect?: (item: AgentItem) => void;
  stepMemory?: Record<string, boolean>;
  /** This group holds the turn's work in progress. */
  live?: boolean;
}) {
  const { colors } = useTheme();
  const folds = items.length > OPEN_UP_TO;
  const failed = items.filter((item) => item.status === 'failed').length;
  const running = live ? items.findLast((item) => item.status === 'running') : undefined;
  // Folded, a group still shows the step in progress and any that failed.
  const shown = !folds || expanded ? items : items.filter((item) => item === running || item.status === 'failed');
  return (
    <View style={s.group}>
      {folds && (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} style={s.summary}
          accessibilityLabel={`${groupSummary(items)}. ${expanded ? 'Hide' : 'Show'} steps`}>
          <Text numberOfLines={1} style={[s.summaryText, { color: colors.muted }]}>
            {groupSummary(items)}
            {failed ? <Text style={{ color: colors.error }}>{` · ${failed} failed`}</Text> : null}
          </Text>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={colors.muted} />
        </Pressable>
      )}
      {shown.map((item) => (
        <Step key={item.id} item={item} live={live} onInspect={onInspect} stepMemory={stepMemory} />
      ))}
    </View>
  );
}

function Step({ item, live, onInspect, stepMemory }: {
  item: ConversationActivity;
  live?: boolean;
  onInspect?: (item: AgentItem) => void;
  stepMemory?: Record<string, boolean>;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(stepMemory?.[item.id] ?? false);
  const label = stepLabel(item);
  // A step left running by a turn that already ended is not still working.
  const spinning = live && item.status === 'running';
  const failed = item.status === 'failed';
  const edit = label.kind === 'edit' && item.source && onInspect;
  const inspectable = Boolean(edit || item.detail?.trim());
  const press = () => {
    if (edit) return onInspect!(item.source!);
    if (stepMemory) stepMemory[item.id] = !open;
    setOpen(!open);
  };
  const said = `${label.verb}${label.subject ? ` ${label.subject}` : ''}`;
  return (
    <View>
      <Pressable disabled={!inspectable} onPress={press} style={({ pressed }) => [s.step, pressed && { opacity: 0.6 }]}
        accessibilityRole={inspectable ? 'button' : undefined} accessibilityLabel={`${said}${failed ? ', failed' : ''}`}
        accessibilityState={inspectable && !edit ? { expanded: open } : undefined}>
        <View style={s.glyph} testID={spinning ? 'conversation-generation' : undefined}
          accessible={spinning} accessibilityLabel={spinning ? said : undefined}>
          {spinning ? <ActivityIndicator size="small" color={colors.muted} style={s.spinner} />
            : <Icon name={failed ? 'alert-circle' : ICONS[label.kind]} size={15} color={failed ? colors.error : colors.muted} />}
        </View>
        <Text numberOfLines={1} style={[s.stepText, { color: colors.muted }]}>
          {label.verb}
          {label.subject ? ' ' : ''}
          {label.subject ? (
            <Text style={[label.code ? s.code : s.subject, { color: failed ? colors.error : colors.text }]}>{label.subject}</Text>
          ) : null}
        </Text>
        {label.added != null && (
          <Text style={s.counts}>
            <Text style={{ color: colors.success }}>+{label.added}</Text>
            <Text style={{ color: colors.error }}> −{label.removed}</Text>
          </Text>
        )}
        {!spinning && item.source?.durationMs != null && item.source.durationMs >= 1000 && (
          <Text style={[s.time, { color: colors.muted }]}>{durationLabel(item.source.durationMs)}</Text>
        )}
      </Pressable>
      {open && !edit && (
        <View style={s.detailBox}>
          <ScrollView horizontal={label.kind !== 'think'} style={[s.detailScroll, { backgroundColor: label.kind === 'think' ? 'transparent' : colors.elevated }]}>
            <Text selectable style={[label.kind === 'think' ? s.reasoning : s.detail, { color: colors.text }]}>
              {item.detail?.slice(-12000)}
              {(item.detail?.length ?? 0) > 12000 ? '\nEarlier output omitted from this view.' : ''}
            </Text>
          </ScrollView>
          {onInspect && item.source?.hasDetail && (
            <Pressable accessibilityRole="button" style={s.more} onPress={() => onInspect(item.source!)}>
              <Text style={[s.moreText, { color: colors.accent }]}>Open full output</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  group: { gap: 0 },
  summary: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  summaryText: { ...font.subhead, flexShrink: 1 },
  step: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10 },
  glyph: { width: 18, alignItems: 'center' },
  spinner: { transform: [{ scale: 0.7 }] },
  stepText: { ...font.subhead, flex: 1 },
  subject: { fontWeight: '500' },
  code: { fontFamily: 'Menlo', fontSize: 13 },
  counts: { ...font.caption, fontVariant: ['tabular-nums'] },
  time: { ...font.caption, fontVariant: ['tabular-nums'] },
  detailBox: { marginLeft: 28, marginBottom: 6, gap: 2 },
  detailScroll: { borderRadius: 10, maxHeight: 280 },
  detail: { fontFamily: 'Menlo', fontSize: 12, lineHeight: 18, paddingHorizontal: 12, paddingVertical: 10 },
  reasoning: { ...font.subhead, paddingVertical: 4 },
  more: { minHeight: 36, justifyContent: 'center' },
  moreText: { ...font.footnote, fontWeight: '600' },
});
