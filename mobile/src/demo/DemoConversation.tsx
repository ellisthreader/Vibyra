import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandMark, Icon } from '../ui/primitives';
import { DecisionSheet } from '../ui/DecisionSheet';
import type { DemoWorkspace } from './data';

export function DemoConversation({ workspace, onReview, onPreview }: {
  workspace: DemoWorkspace; onReview: () => void; onPreview: () => void;
}) {
  const { colors } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const count = useRef(workspace.messages.length);
  const [decision, setDecision] = useState(false);
  const approval = workspace.selectedSessionId === 'demo-shortcuts'
    ? workspace.approvals.find(item => item.id === 'demo-checks') : undefined;
  const session = workspace.sessions.find(item => item.id === workspace.selectedSessionId);
  const provider = session?.kind === 'codex' ? 'Codex' : 'Claude Code';
  useEffect(() => {
    if (workspace.messages.length > count.current) scroll.current?.scrollToEnd({ animated: false });
    count.current = workspace.messages.length;
  }, [workspace.messages.length]);
  return <><ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    {workspace.messages.length === 0 && <View style={s.empty}>
      <BrandMark size={44} /><Text style={[s.emptyTitle, { color: colors.text }]}>A fresh conversation.</Text>
      <Text style={[s.emptyDetail, { color: colors.muted }]}>What would you like to build?</Text>
    </View>}
    {workspace.messages.map(message => message.role === 'user' ?
      <View key={message.id} style={[s.user, { backgroundColor: colors.elevated }]}>
        <Text selectable style={[s.message, { color: colors.text }]}>{message.text}</Text>
      </View> : <View key={message.id} style={s.response}>
        <View style={s.author}><BrandMark size={24} />
          <Text style={[s.authorText, { color: colors.text }]}>Vibyra</Text>
          <Text style={[s.provider, { color: colors.muted }]}>{provider}</Text></View>
        <Text selectable style={[s.message, { color: colors.text }]}>{message.text}</Text>
        {message.result && <View style={[s.artifact, { borderColor: colors.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Review changes" onPress={onReview}
            style={({ pressed }) => [s.result, { opacity: pressed ? 0.6 : 1 }]}>
            <View style={[s.fileIcon, { backgroundColor: colors.elevated }]}>
              <Icon name="code-slash-outline" size={19} color={colors.muted} /></View>
            <View style={s.resultText}><Text style={[s.resultTitle, { color: colors.text }]}>Review changes</Text>
              <Text style={[s.fileName, { color: colors.muted }]}>src/checkout.tsx</Text></View>
            <View style={s.diff}><Text style={[s.diffText, { color: colors.success }]}>+4</Text>
              <Text style={[s.diffText, { color: colors.error }]}>−3</Text></View>
            <Icon name="chevron-forward" size={15} color={colors.muted} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open preview" onPress={onPreview}
            style={({ pressed }) => [s.preview, { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
            <Icon name="browsers-outline" size={17} color={colors.muted} />
            <Text style={[s.previewText, { color: colors.text }]}>Open preview</Text>
            <Icon name="open-outline" size={16} color={colors.muted} />
          </Pressable>
        </View>}
      </View>)}
    {approval && <Pressable accessibilityRole="button" accessibilityLabel={approval.title}
      onPress={() => setDecision(true)} style={({ pressed }) => [s.permission,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
      <View style={[s.fileIcon, { backgroundColor: colors.elevated }]}>
        <Icon name="hand-left-outline" size={18} color={colors.warning} /></View>
      <View style={s.resultText}><Text style={[s.resultTitle, { color: colors.text }]}>{approval.title}</Text>
        <Text style={[s.fileName, { color: colors.muted }]}>Permission needed</Text></View>
      <Icon name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>}
  </ScrollView>
    <DecisionSheet approval={decision ? approval : undefined} workspace={workspace} onClose={() => setDecision(false)} />
  </>;
}
const s = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 23, paddingTop: 26, paddingBottom: 32, gap: 29 },
  user: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 24, borderBottomRightRadius: 8,
    maxWidth: '91%', alignSelf: 'flex-end', marginLeft: 20 },
  message: { fontSize: 16, lineHeight: 27, letterSpacing: -0.1 }, response: { gap: 17 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 8 }, authorText: { fontSize: 13, fontWeight: '600' },
  provider: { fontSize: 11, marginLeft: 2 },
  permission: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, minHeight: 82,
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  artifact: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, marginTop: 2, overflow: 'hidden' },
  result: { minHeight: 82, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileIcon: { width: 36, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  resultText: { flex: 1, gap: 5 }, resultTitle: { fontSize: 13, fontWeight: '600' }, fileName: { fontSize: 11 },
  diff: { flexDirection: 'row', gap: 5 }, diffText: { fontSize: 11, fontWeight: '600' },
  preview: { minHeight: 49, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth }, previewText: { flex: 1, fontSize: 12, fontWeight: '500' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18, paddingBottom: 50 },
  emptyTitle: { fontSize: 25, letterSpacing: -0.8, fontWeight: '500' }, emptyDetail: { fontSize: 15 },
});
