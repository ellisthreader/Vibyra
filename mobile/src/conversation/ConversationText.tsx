import { Fragment } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { ConversationInline } from './ConversationInline';
import { ConversationTable } from './ConversationTable';
import { markdownBlocks } from './markdownBlocks';

/** Native, selectable text. Never runs HTML or automatically opens agent-supplied links. */
export function ConversationText({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={s.blocks}>
      {markdownBlocks(text).map((block, index) => {
        if (block.kind === 'table') return <ConversationTable key={index} table={block} />;
        if (block.kind === 'code') {
          return (
            <ScrollView
              key={index}
              horizontal
              style={[s.code, { backgroundColor: colors.elevated, borderColor: colors.border }]}
            >
              <Text selectable style={[s.codeText, { color: colors.text }]}>
                {block.text}
              </Text>
            </ScrollView>
          );
        }
        return (
          <Fragment key={index}>
            {block.text
              .trim()
              .split('\n')
              .map((line, row) => {
                const heading = /^(#{1,3})\s+/.test(line);
                const content = line.replace(/^#{1,3}\s+/, '').replace(/^[-*]\s+/, '• ');
                return (
                  <Text
                    selectable
                    key={row}
                    accessibilityRole={heading ? 'header' : undefined}
                    style={[s.body, heading && s.heading, { color: colors.text }]}
                  >
                    <ConversationInline text={content} />
                  </Text>
                );
              })}
          </Fragment>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  blocks: { gap: 3 },
  body: { fontSize: 16, lineHeight: 25, letterSpacing: -0.2 },
  heading: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
    letterSpacing: -0.35,
    marginTop: 14,
    marginBottom: 4,
  },
  code: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginVertical: 8 },
  codeText: {
    fontFamily: 'Menlo',
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
