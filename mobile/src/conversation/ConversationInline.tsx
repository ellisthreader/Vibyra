import { Alert, Linking, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';
import { useContext } from 'react';
import { LocalLinkContext, macLocalUrl } from './localLink';
import { safeConversationLink } from './safeLink';

export function ConversationInline({ text }: { text: string }) {
  const { colors } = useTheme();
  const openLocal = useContext(LocalLinkContext);
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        const href = link && safeConversationLink(link[2]);
        if (href)
          return (
            <Text
              key={index}
              accessibilityRole="link"
              style={{ color: colors.accent, textDecorationLine: 'underline' }}
              onPress={() =>
                void Linking.openURL(href).catch(() => Alert.alert('Could not open link', href))
              }
            >
              {link![1]}
            </Text>
          );
        // A link to a site on the Mac opens in Live Preview; any other the phone
        // will not open keeps its words, never the raw [text](url) markup.
        if (link) {
          const local = openLocal && macLocalUrl(link[2]);
          return (
            <Text key={index} accessibilityRole={local ? 'link' : undefined}
              style={local ? { color: colors.accent, textDecorationLine: 'underline' } : undefined}
              onPress={local ? () => openLocal(link[2]) : undefined}>
              {link[1]}
            </Text>
          );
        }
        return (
          <Text
            key={index}
            style={
              part.startsWith('**')
                ? s.bold
                : part.startsWith('`')
                  ? [s.code, { backgroundColor: colors.elevated }]
                  : undefined
            }
          >
            {part.startsWith('**')
              ? part.slice(2, -2)
              : part.startsWith('`')
                ? part.slice(1, -1)
                : part}
          </Text>
        );
      })}
    </>
  );
}
const s = StyleSheet.create({
  bold: { fontWeight: '600' },
  code: { fontFamily: 'Menlo', fontSize: 14, borderRadius: 4 },
});
