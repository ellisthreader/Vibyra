import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ConversationText } from '../conversation/ConversationText';
import { useTheme } from '../theme';
import { Icon } from '../ui/primitives';
import { Mark } from '../ui/BrandLogo';
import { referenceIds } from '../integrations/chatReferences';
import { MentionText } from '../integrations/MentionText';
import { integrationBrand } from '../integrations/integrationBrands';
import { vibes } from './count';
import { MemoryNotes } from './MemoryNotes';
import { Spark } from './Spark';
import { useGlass } from './glass';
import { activeTurn, isProjectTool, type VibesTool, type VibesTurn } from './types';

// `previews` are the phone's own copies of photos it sent, by attachment id: the
// server keeps a photo only to send it, so an older one is shown by its name instead.
// `onMemory` opens Settings > Memory from the line under a reply that changed it.
export function VibesConversation({ turns, tools, previews = {}, onMemory, renderTool, teammate = false }: { teammate?: boolean; renderTool?: (tool: VibesTool, turn: VibesTurn) => ReactNode; turns: VibesTurn[]; tools?: ReactElement; previews?: Record<string, string>; onMemory?: () => void }) {
  const { colors } = useTheme(); const glass = useGlass(); const list = useRef<FlatList>(null);
  const nearBottom = useRef(true); const [unread, setUnread] = useState(false);
  const tail = turns.at(-1); const update = [turns.length, tail?.status, tail?.response?.length].join(':');
  useEffect(() => { if (!nearBottom.current) setUnread(true); }, [update]);
  return <View style={s.body}><FlatList<VibesTurn> ref={list} data={turns} keyExtractor={t => t.id} contentContainerStyle={[s.content, teammate && { gap: 18, paddingHorizontal: 14 }]} ListFooterComponent={tools}
    onScroll={e => { const n = e.nativeEvent; nearBottom.current = n.contentSize.height - n.layoutMeasurement.height - n.contentOffset.y < 100; if (nearBottom.current) setUnread(false); }}
    scrollEventThrottle={80} onContentSizeChange={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }); }}
    keyboardShouldPersistTaps="handled" renderItem={({ item: t }) => <View style={[s.turn, teammate && { gap: 12 }]}>
      {t.attachments?.length ? <View style={s.attached}>{t.attachments.map(a => a.kind === 'image' && previews[a.id]
        ? <Image key={a.id} source={{ uri: previews[a.id] }} style={s.photo} accessibilityLabel={`Photo ${a.name}`} accessibilityIgnoresInvertColors />
        : <View key={a.id} accessible accessibilityLabel={`${a.kind === 'image' ? 'Photo' : 'File'} ${a.name}`}
          style={[s.file, { backgroundColor: colors.elevated }]}>
          <Icon name={a.kind === 'image' ? 'image-outline' : a.kind === 'pdf' ? 'document-text-outline' : 'code-slash-outline'} size={14} color={colors.muted} />
          <Text numberOfLines={1} style={[s.fileName, { color: colors.muted }]}>{a.name}</Text>
        </View>)}</View> : null}
      <View style={[s.user, { backgroundColor: teammate ? colors.action : glass.well, borderColor: teammate ? colors.action : glass.rim }]}><Text selectable style={[s.prompt, { color: teammate ? colors.onAction : colors.text }, teammate && { fontSize: 14, lineHeight: 21 }]}><MentionText text={t.prompt} known={referenceIds} /></Text></View>
      <View style={s.reply}>{t.response && <View style={teammate && { backgroundColor: colors.elevated, padding: 12, borderRadius: 13, borderBottomLeftRadius: 3 }}><ConversationText text={t.response} /></View>}
        {activeTurn(t) && <View accessibilityLiveRegion="polite" style={s.activity}><Spark size={30} breathing />
          <Text style={[s.status, { color: colors.muted }]}>{t.status === 'queued' ? 'Getting ready…' : t.status === 'waiting'
            ? (t.tools?.some(tool => tool.approval?.state === 'pending') ? 'Waiting for your approval…' : t.tools?.some(isProjectTool) ? 'Waiting for project tools…' : 'Asking your integrations…')
            : t.status === 'reconciling' ? 'Checking your reply and usage…' : 'Thinking it through…'}</Text></View>}
        {/* An integration call shows its own mark and the one line the server recorded,
            so the transcript says which account answered without repeating it. */}
        {t.tools?.map(tool => renderTool?.(tool, t) || (tool.integration ? <View key={tool.id} style={s.integration}>
          <Mark brand={integrationBrand(tool.integration)} size={20} />
          <Text selectable style={[s.status, { color: colors.muted }]}>{tool.summary ?? 'Used ' + tool.integration}</Text>
        </View> : !isProjectTool(tool) || tool.result == null ? null : <Text key={tool.id} selectable style={[s.status, { color: colors.muted }]}>
          {tool.result?.declined ? 'Declined' : tool.result?.error ? 'Could not complete'
            : tool.operation === 'write_file' ? 'Saved' : tool.operation === 'read_file' ? 'Read' : tool.operation === 'search_files' ? 'Searched' : 'Listed'}: {tool.arguments.path || tool.arguments.query || 'Project files'}
          {typeof tool.result?.error === 'string' ? ` · ${tool.result.error}` : ''}
        </Text>))}
        <MemoryNotes turn={t} onOpen={onMemory} />
        {t.error && <Text style={[s.status, { color: colors.muted }]}>{t.error}</Text>}
        {!activeTurn(t) && <Text style={[s.usage, { color: colors.muted }]}>{vibes(t.charged)} used{t.status === 'cancelled' ? ' · Stopped' : ''}</Text>}
      </View>
    </View>} />
    {unread && <Pressable accessibilityRole="button" accessibilityLabel="Show new reply" onPress={() => { nearBottom.current = true; setUnread(false); list.current?.scrollToEnd({ animated: true }); }}
      style={[s.newReply, glass.sheet]}><Icon name="arrow-down" size={16} /><Text style={[s.newReplyText, { color: colors.text }]}>New reply</Text></Pressable>}
  </View>;
}
const s = StyleSheet.create({ body: { flex: 1 }, content: { paddingHorizontal: 20, paddingVertical: 16, gap: 32 }, turn: { gap: 20 },
  attached: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 6, marginBottom: -12 },
  photo: { width: 132, height: 132, borderRadius: 18 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, maxWidth: 220 },
  fileName: { fontSize: 12, flexShrink: 1 },
  user: { alignSelf: 'flex-end', maxWidth: '88%', borderRadius: 22, borderBottomRightRadius: 8, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 11 },
  prompt: { fontSize: 17, lineHeight: 24, letterSpacing: -0.2 }, reply: { gap: 12, paddingHorizontal: 2 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, marginLeft: -6 },
  status: { fontSize: 14, lineHeight: 21, flexShrink: 1 }, usage: { fontSize: 12 },
  integration: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  newReply: { position: 'absolute', bottom: 12, alignSelf: 'center', paddingHorizontal: 16, height: 40, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 8 },
  newReplyText: { fontSize: 14, fontWeight: '500' },
});
