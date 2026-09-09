import { useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ConversationText } from '../conversation/ConversationText';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { activeTurn, type VibesTurn } from './types';

export function VibesConversation({ turns, tools }: { turns: VibesTurn[]; tools?: ReactElement }) {
  const { colors } = useTheme(); const list = useRef<FlatList>(null);
  const nearBottom = useRef(true); const [unread, setUnread] = useState(false);
  const tail = turns.at(-1); const update = [turns.length, tail?.status, tail?.response?.length].join(':');
  useEffect(() => { if (!nearBottom.current) setUnread(true); }, [update]);
  return <View style={s.body}><FlatList<VibesTurn> ref={list} data={turns} keyExtractor={t => t.id} contentContainerStyle={s.content} ListFooterComponent={tools}
    onScroll={e => { const n = e.nativeEvent; nearBottom.current = n.contentSize.height - n.layoutMeasurement.height - n.contentOffset.y < 100; if (nearBottom.current) setUnread(false); }}
    scrollEventThrottle={80} onContentSizeChange={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }); }}
    keyboardShouldPersistTaps="handled" renderItem={({ item: t }) => <View style={s.turn}>
      <View style={[s.user, { backgroundColor: colors.elevated }]}><Text selectable style={[s.prompt, { color: colors.text }]}>{t.prompt}</Text></View>
      <View style={s.reply}>{t.response && <ConversationText text={t.response} />}
        {activeTurn(t) && <View accessibilityLiveRegion="polite" style={s.activity}><ActivityIndicator size="small" color={colors.accent} />
          <Text style={[s.status, { color: colors.muted }]}>{t.status === 'queued' ? 'Getting ready…' : t.status === 'waiting' ? 'Waiting for project tools…' : t.status === 'reconciling' ? 'Checking your reply and usage…' : 'Thinking it through…'}</Text></View>}
        {t.tools?.filter(tool => tool.result !== null).map(tool => <Text key={tool.id} selectable style={[s.status, { color: colors.muted }]}>
          {tool.result?.declined ? 'Declined' : tool.result?.error ? 'Could not complete' : tool.operation === 'write_file' ? 'Saved' : tool.operation === 'read_file' ? 'Read' : 'Listed'}: {tool.arguments.path || 'Project files'}
          {typeof tool.result?.error === 'string' ? ` · ${tool.result.error}` : ''}
        </Text>)}
        {t.error && <Text style={[s.status, { color: colors.muted }]}>{t.error}</Text>}
        {!activeTurn(t) && <Text style={[s.usage, { color: colors.muted }]}>{t.charged} Vibes used{t.status === 'cancelled' ? ' · Stopped' : ''}</Text>}
      </View>
    </View>} />
    {unread && <Pressable accessibilityRole="button" accessibilityLabel="Show new reply" onPress={() => { nearBottom.current = true; setUnread(false); list.current?.scrollToEnd({ animated: true }); }}
      style={[s.newReply, { backgroundColor: colors.surface, borderColor: colors.border }]}><Icon name="arrow-down" size={16} /><Text style={{ color: colors.text }}>New reply</Text></Pressable>}
  </View>;
}
const s = StyleSheet.create({ body: { flex: 1 }, content: { paddingHorizontal: 22, paddingVertical: 18, gap: 30 }, turn: { gap: 22 },
  user: { alignSelf: 'flex-end', maxWidth: '94%', borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 17, paddingVertical: 12 },
  prompt: { fontSize: 16, lineHeight: 24 }, reply: { gap: 13 }, activity: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  status: { fontSize: 14, lineHeight: 21, flexShrink: 1 }, usage: { fontSize: 11 },
  newReply: { position: 'absolute', bottom: 12, alignSelf: 'center', paddingHorizontal: 16, minHeight: 44, borderRadius: 23, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
