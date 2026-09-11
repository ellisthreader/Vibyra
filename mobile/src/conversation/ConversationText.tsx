import { Fragment } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

/** Native, selectable text. Never runs HTML or automatically opens agent-supplied links. */
export function ConversationText({ text }: { text: string }) {
  const { colors } = useTheme();
  return <View style={s.blocks}>{text.split(/(```[\s\S]*?```)/g).filter(Boolean).map((block, index) => {
    if (block.startsWith('```') && block.endsWith('```')) {
      const code = block.slice(3, -3).replace(/^[\w+-]*\n/, '');
      return <ScrollView key={index} horizontal style={[s.code, { backgroundColor: colors.elevated }]}>
        <Text selectable style={[s.codeText, { color: colors.text }]}>{code}</Text>
      </ScrollView>;
    }
    return <Fragment key={index}>{block.trim().split('\n').map((line, row) => {
      const heading = /^(#{1,3})\s+/.test(line);
      const content = line.replace(/^#{1,3}\s+/, '').replace(/^[-*]\s+/, '• ');
      return <Text selectable key={row} accessibilityRole={heading ? 'header' : undefined}
        style={[s.body, heading && s.heading, { color: colors.text }]}>
        {content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, partIndex) =>
          <Text key={partIndex} style={part.startsWith('**') ? s.bold : part.startsWith('`') ? s.inlineCode : undefined}>
            {part.startsWith('**') ? part.slice(2, -2) : part.startsWith('`') ? part.slice(1, -1) : part}
          </Text>)}
      </Text>;
    })}</Fragment>;
  })}</View>;
}
const s = StyleSheet.create({
  blocks: { gap: 2 }, body: { fontSize: 17, lineHeight: 27, letterSpacing: -0.15 },
  heading: { fontSize: 18, fontWeight: '600', marginTop: 12, marginBottom: 5 }, bold: { fontWeight: '600' },
  inlineCode: { fontFamily: 'Menlo', fontSize: 14 }, code: { borderRadius: 14, marginVertical: 10 },
  codeText: { fontFamily: 'Menlo', fontSize: 13, lineHeight: 21, padding: 15 },
});
