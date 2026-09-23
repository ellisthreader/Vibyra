import { styles as s } from './DemoConversationStyles';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { BrandMark, Icon } from '../ui/primitives';
import { DecisionSheet } from '../ui/DecisionSheet';
import type { DemoWorkspace } from './data';

export function DemoConversation({
  workspace,
  onReview,
  onPreview,
}: {
  workspace: DemoWorkspace;
  onReview: () => void;
  onPreview: () => void;
}) {
  const { colors } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const count = useRef(workspace.messages.length);
  const [decision, setDecision] = useState(false);
  const approval =
    workspace.selectedSessionId === 'demo-shortcuts'
      ? workspace.approvals.find((item) => item.id === 'demo-checks')
      : undefined;
  const session = workspace.sessions.find((item) => item.id === workspace.selectedSessionId);
  const provider = session?.kind === 'codex' ? 'Codex' : 'Claude Code';
  useEffect(() => {
    if (workspace.messages.length > count.current) scroll.current?.scrollToEnd({ animated: false });
    count.current = workspace.messages.length;
  }, [workspace.messages.length]);
  return (
    <>
      <ScrollView
        ref={scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {workspace.messages.length === 0 && (
          <View style={s.empty}>
            <BrandMark size={44} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>A fresh conversation.</Text>
            <Text style={[s.emptyDetail, { color: colors.muted }]}>
              What would you like to build?
            </Text>
          </View>
        )}
        {workspace.messages.map((message) =>
          message.role === 'user' ? (
            <View key={message.id} style={[s.user, { backgroundColor: colors.elevated }]}>
              <Text selectable style={[s.message, { color: colors.text }]}>
                {message.text}
              </Text>
            </View>
          ) : (
            <View key={message.id} style={s.response}>
              <View style={s.author}>
                <BrandMark size={20} />
                <Text style={[s.authorText, { color: colors.text }]}>Vibyra</Text>
                <Text
                  style={[s.provider, { color: colors.muted, backgroundColor: colors.elevated }]}
                >
                  {provider}
                </Text>
              </View>
              <Text selectable style={[s.message, { color: colors.text }]}>
                {message.text}
              </Text>
              {message.result && (
                <View
                  style={[
                    s.artifact,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Review changes"
                    onPress={onReview}
                    style={({ pressed }) => [s.result, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <View style={[s.fileIcon, { backgroundColor: colors.elevated }]}>
                      <Icon name="code-slash-outline" size={18} color={colors.text} />
                    </View>
                    <View style={s.resultText}>
                      <Text style={[s.resultTitle, { color: colors.text }]}>Review changes</Text>
                      <Text style={[s.fileName, { color: colors.muted }]}>src/checkout.tsx</Text>
                    </View>
                    <View style={s.diff}>
                      <Text style={[s.diffText, { color: colors.success }]}>+4</Text>
                      <Text style={[s.diffText, { color: colors.error }]}>−3</Text>
                    </View>
                    <Icon name="chevron-forward" size={15} color={colors.muted} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open preview"
                    onPress={onPreview}
                    style={({ pressed }) => [
                      s.preview,
                      { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Icon name="browsers-outline" size={17} color={colors.accent} />
                    <Text style={[s.previewText, { color: colors.accent }]}>Open preview</Text>
                    <Icon name="open-outline" size={15} color={colors.muted} />
                  </Pressable>
                </View>
              )}
            </View>
          ),
        )}
        {approval && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={approval.title}
            onPress={() => setDecision(true)}
            style={({ pressed }) => [
              s.permission,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <View style={[s.fileIcon, { backgroundColor: colors.elevated }]}>
              <Icon name="hand-left-outline" size={18} color={colors.warning} />
            </View>
            <View style={s.resultText}>
              <Text style={[s.resultTitle, { color: colors.text }]}>{approval.title}</Text>
              <View style={s.needed}>
                <View style={[s.neededDot, { backgroundColor: colors.warning }]} />
                <Text style={[s.fileName, { color: colors.warning }]}>Permission needed</Text>
              </View>
            </View>
            <Icon name="chevron-forward" size={15} color={colors.muted} />
          </Pressable>
        )}
      </ScrollView>
      <DecisionSheet
        approval={decision ? approval : undefined}
        workspace={workspace}
        onClose={() => setDecision(false)}
      />
    </>
  );
}
