import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandMark, Icon } from '../ui/primitives';
import { ActivityGroup } from './ActivityGroup';
import { ConversationResult } from './ConversationResult';
import { ConversationText } from './ConversationText';
import { PermissionCard } from './PermissionCard';
import { QuestionCard, type QuestionDraft } from './QuestionCard';
import { conversationRows, type ConversationRow } from './conversationRows';
import type { ConversationViewProps } from './types';

export function ConversationView(props: ConversationViewProps) {
  const { colors } = useTheme();
  const { items, connected, canRespond, status } = props;
  const list = useRef<FlatList<ConversationRow>>(null);
  const following = useRef(true);
  const editing = useRef(false);
  const questionDrafts = useRef<Record<string, QuestionDraft>>({});
  const [newActivity, setNewActivity] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [historyError, setHistoryError] = useState<string>();
  const rows = useMemo(() => conversationRows(items), [items]);
  const unresolved = (row: ConversationRow) => (row.kind === 'permission' || row.kind === 'question')
    && ['pending', 'resolving'].includes(row.status);
  const pending = rows.find(unresolved);
  const awaiting = rows.filter(unresolved).length;
  const statusLabel = !connected ? 'Disconnected · showing last known activity'
    : pending ? 'Waiting for your input' : status === 'working' ? 'Working on your request'
      : status === 'error' ? 'The agent needs attention' : '';
  useEffect(() => { if (statusLabel) AccessibilityInfo.announceForAccessibility(statusLabel); }, [statusLabel]);
  useEffect(() => { if (!following.current) setNewActivity(true); }, [items]);
  const jumpToBottom = () => { following.current = true; setNewActivity(false); list.current?.scrollToEnd({ animated: false }); };
  const loadEarlier = async () => {
    if (loadingEarlier || !props.onLoadEarlier) return;
    following.current = false; setLoadingEarlier(true); setHistoryError(undefined);
    try { await props.onLoadEarlier(); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : 'Earlier messages could not be loaded.'); }
    finally { setLoadingEarlier(false); }
  };
  const renderItem = ({ item }: { item: ConversationRow }) => {
    if (item.kind === 'activities') return <ActivityGroup items={item.items} expanded={Boolean(expanded[item.id])}
      onToggle={() => setExpanded(old => ({ ...old, [item.id]: !old[item.id] }))} />;
    if (item.kind === 'message') return <View style={item.role === 'user'
      ? [s.user, { backgroundColor: colors.elevated }] : s.assistant}>
      {item.role === 'user' ? <Text selectable style={[s.userText, { color: colors.text }]}>{item.text}</Text>
        : <ConversationText text={item.text} />}
    </View>;
    if (item.kind === 'permission' || item.kind === 'question') {
      if (item.status === 'pending' && pending?.id !== item.id) return <Text style={[s.queued, { color: colors.muted }]}>
        {item.title} · waiting for the earlier request</Text>;
      return item.kind === 'permission'
        ? <PermissionCard item={item} canRespond={canRespond && connected} onDecision={props.onDecision} />
        : <QuestionCard item={item} canRespond={canRespond && connected} onAnswer={props.onAnswer}
          draft={questionDrafts.current[item.id]} onDraft={draft => { questionDrafts.current[item.id] = draft; }}
          onEditing={value => { editing.current = value; }} />;
    }
    return <ConversationResult item={item} onReview={props.onReview} />;
  };
  return <View style={s.root}>
    <FlatList ref={list} data={rows} keyExtractor={item => item.id} renderItem={renderItem}
      extraData={{ expanded, canRespond, connected, pending: pending?.id }}
      contentContainerStyle={s.content} ItemSeparatorComponent={() => <View style={s.separator} />}
      keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" initialNumToRender={12}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      maxToRenderPerBatch={8} windowSize={9} removeClippedSubviews={false}
      onContentSizeChange={() => { if (following.current && !editing.current) list.current?.scrollToEnd({ animated: false }); }}
      onLayout={() => { if (following.current && !editing.current) list.current?.scrollToEnd({ animated: false }); }}
      onScroll={event => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        following.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 100;
        if (following.current) setNewActivity(false);
      }} scrollEventThrottle={100}
      ListHeaderComponent={props.hasEarlier || historyError ? <View style={s.history}>
        {props.hasEarlier && <Pressable accessibilityRole="button" accessibilityLabel="Load older messages"
          disabled={loadingEarlier || !connected} onPress={() => void loadEarlier()} style={s.historyButton}>
          <Text style={[s.status, { color: colors.muted }]}>{loadingEarlier ? 'Loading earlier messages…' : 'Older messages'}</Text>
          <Icon name="chevron-up" size={13} color={colors.muted} /></Pressable>}
        {historyError && <Text accessibilityLiveRegion="polite" style={[s.status, { color: colors.error }]}>{historyError}</Text>}
      </View> : null}
      ListEmptyComponent={<View style={s.empty}><BrandMark size={40} />
        <Text style={[s.emptyTitle, { color: colors.text }]}>What shall we build?</Text>
        <Text style={[s.emptyCopy, { color: colors.muted }]}>An idea, a small fix, or something new.</Text></View>}
      ListFooterComponent={statusLabel ? <View style={s.footer}>
        <View style={[s.dot, { backgroundColor: connected ? colors.accent : colors.warning }]} />
        <Text style={[s.status, { color: colors.muted }]}>{statusLabel}{awaiting > 1 ? ` · ${awaiting} requests` : ''}</Text>
      </View> : null} />
    {newActivity && <Pressable accessibilityRole="button" accessibilityLabel="Jump to latest activity" onPress={jumpToBottom}
      style={[s.jump, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Icon name="arrow-down" size={16} color={colors.text} />
      <Text style={[s.jumpText, { color: colors.text }]}>Latest activity</Text>
    </Pressable>}
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1 }, content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 26, paddingBottom: 24 },
  separator: { height: 24 }, user: { paddingHorizontal: 17, paddingVertical: 13, borderRadius: 23,
    borderBottomRightRadius: 7, maxWidth: '92%', alignSelf: 'flex-end', marginLeft: 18 },
  userText: { fontSize: 16, lineHeight: 25 }, assistant: { paddingVertical: 2 },
  queued: { fontSize: 13, lineHeight: 20 }, footer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 24 },
  dot: { width: 6, height: 6, borderRadius: 3 }, status: { fontSize: 12, lineHeight: 19, flex: 1 },
  empty: { paddingTop: 55, paddingBottom: 50, gap: 16, alignItems: 'center' },
  emptyTitle: { fontSize: 26, fontWeight: '500', letterSpacing: -0.8, textAlign: 'center' },
  emptyCopy: { fontSize: 15, lineHeight: 23, textAlign: 'center' },
  jump: { position: 'absolute', bottom: 10, alignSelf: 'center', minHeight: 44, paddingHorizontal: 17,
    borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  jumpText: { fontSize: 13, fontWeight: '500' },
  history: { alignItems: 'center', paddingBottom: 16 },
  historyButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
});
