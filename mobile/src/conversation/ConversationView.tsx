import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandMark, Icon } from '../ui/primitives';
import { conversationViewMemory } from './viewMemory';
import { turnSummary } from './turnSummary';
import { generationPresentation } from './generation';
import { GenerationIndicator } from './GenerationIndicator';
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
  const memory = useMemo(() => conversationViewMemory(props.memoryKey ?? 'fixture'), [props.memoryKey]);
  const following = useRef(memory.following);
  const editing = useRef(false);
  useEffect(() => {
    let frame: number;
    const followKeyboard = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (following.current && !editing.current) list.current?.scrollToEnd({ animated: false });
      });
    };
    const shown = Keyboard.addListener('keyboardDidShow', followKeyboard);
    const hidden = Keyboard.addListener('keyboardDidHide', followKeyboard);
    return () => { shown.remove(); hidden.remove(); cancelAnimationFrame(frame); };
  }, []);
  const questionDrafts = useRef<Record<string, QuestionDraft>>(memory.questions);
  const [newActivity, setNewActivity] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(memory.expanded);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [historyError, setHistoryError] = useState<string>();
  const rows = useMemo(() => conversationRows(items), [items]);
  const unresolved = (row: ConversationRow) => (row.kind === 'permission' || row.kind === 'question')
    && ['pending', 'resolving'].includes(row.status);
  const pending = rows.find(unresolved);
  const awaiting = rows.filter(unresolved).length;
  const sources = items.flatMap(item => 'source' in item && item.source ? [item.source] : []);
  const generation = generationPresentation(rows, status, connected, props.turnId);
  const statusLabel = !connected ? 'Disconnected · showing last known activity'
    : pending ? 'Waiting for your input'
      : status === 'error' ? 'The agent needs attention' : '';
  const announcement = statusLabel || generation?.label;
  useEffect(() => { if (announcement) AccessibilityInfo.announceForAccessibility(announcement); }, [announcement]);
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
      liveLabel={generation?.owner === item.id ? generation.label : undefined}
      stepMemory={memory.steps} onInspect={props.onInspect} onToggle={() => setExpanded(old => { memory.expanded = { ...old, [item.id]: !old[item.id] }; return memory.expanded; })} />;
    if (item.kind === 'message') return <View style={item.role === 'user'
      ? [s.user, { backgroundColor: colors.elevated }] : s.assistant}>
      {item.role === 'user' ? <Text selectable style={[s.userText, { color: colors.text }]}>{item.text}</Text>
        : <ConversationText text={item.text} />}
      {generation?.owner === item.id && <GenerationIndicator label={generation.label} compact />}
      {item.source?.hasDetail && props.onInspect && <Pressable accessibilityRole="button" style={s.historyButton} onPress={() => props.onInspect!(item.source!)}><Text style={{ color: colors.accent }}>Read full message</Text></Pressable>}
    </View>;
    if (item.kind === 'permission' || item.kind === 'question') {
      if (item.status === 'pending' && pending?.id !== item.id) return <Text style={[s.queued, { color: colors.muted }]}>
        {item.title} · waiting for the earlier request</Text>;
      return item.kind === 'permission'
        ? <PermissionCard item={item} canRespond={canRespond && connected} onDecision={props.onDecision} onInspect={props.onInspect} />
        : <QuestionCard item={item} canRespond={canRespond && connected} onAnswer={props.onAnswer}
          draft={questionDrafts.current[item.id]} onDraft={draft => {
            const keep = (entries: Record<string, string>) => Object.fromEntries(Object.entries(entries).filter(([id]) => !item.questions.find(q => q.id === id)?.secret));
            questionDrafts.current[item.id] = { selected: keep(draft.selected), written: keep(draft.written) };
          }}
          onEditing={value => { editing.current = value; }} />;
    }
    return <ConversationResult item={item} summary={turnSummary(sources, item.turnId)} onReview={props.onReview} />;
  };
  return <View style={s.root}>
    <FlatList ref={list} data={rows} keyExtractor={item => item.id} renderItem={renderItem}
      extraData={{ expanded, canRespond, connected, pending: pending?.id }}
      contentContainerStyle={s.content} ItemSeparatorComponent={() => <View style={s.separator} />}
      keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" initialNumToRender={12}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      maxToRenderPerBatch={8} windowSize={9} removeClippedSubviews={false}
      onContentSizeChange={() => { if (following.current && !editing.current) list.current?.scrollToEnd({ animated: false }); }}
      onLayout={() => { if (following.current && !editing.current) requestAnimationFrame(() => {
        if (following.current && !editing.current) list.current?.scrollToEnd({ animated: false });
      }); else if (memory.offset) list.current?.scrollToOffset({ offset: memory.offset, animated: false }); }}
      onScroll={event => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        following.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 100;
        memory.offset = contentOffset.y; memory.following = following.current;
        if (following.current) setNewActivity(false);
      }} scrollEventThrottle={100}
      ListHeaderComponent={props.hasEarlier || historyError ? <View style={s.history}>
        {props.hasEarlier && <Pressable accessibilityRole="button" accessibilityLabel="Load older messages"
          disabled={loadingEarlier || !connected} onPress={() => void loadEarlier()} style={s.historyButton}>
          <Text style={[s.status, { color: colors.muted }]}>{loadingEarlier ? 'Loading earlier messages…' : 'Older messages'}</Text>
          <Icon name="chevron-up" size={13} color={colors.muted} /></Pressable>}
        {historyError && <Text accessibilityLiveRegion="polite" style={[s.status, { color: colors.error }]}>{historyError}</Text>}
      </View> : null}
      ListEmptyComponent={status === 'idle' ? <View style={s.empty}><BrandMark size={40} />
        <Text style={[s.emptyTitle, { color: colors.text }]}>What shall we build?</Text>
        <Text style={[s.emptyCopy, { color: colors.muted }]}>An idea, a small fix, or something new.</Text></View> : null}
      ListFooterComponent={generation?.owner === 'footer' ? <View style={s.footer}><GenerationIndicator label={generation.label} /></View> : statusLabel ? <View style={s.footer}>
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
  root: { flex: 1 }, content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  separator: { height: 20 }, user: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 20, borderBottomRightRadius: 6,
    maxWidth: '88%', alignSelf: 'flex-end', marginLeft: 18 },
  userText: { fontSize: 16, lineHeight: 23, letterSpacing: -0.2 }, assistant: { paddingVertical: 2 },
  queued: { fontSize: 13, lineHeight: 18 }, footer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 20 },
  dot: { width: 7, height: 7, borderRadius: 4 }, status: { fontSize: 13, lineHeight: 18, letterSpacing: -0.05, flex: 1 },
  empty: { paddingTop: 64, paddingBottom: 50, gap: 10, alignItems: 'center' },
  emptyTitle: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.6, textAlign: 'center', marginTop: 8 },
  emptyCopy: { fontSize: 15, lineHeight: 22, letterSpacing: -0.2, textAlign: 'center' },
  jump: { position: 'absolute', bottom: 10, alignSelf: 'center', minHeight: 40, paddingHorizontal: 16,
    borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 7,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  jumpText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  history: { alignItems: 'center', paddingBottom: 16 },
  historyButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
});
