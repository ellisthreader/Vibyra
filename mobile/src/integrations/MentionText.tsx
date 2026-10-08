import { Text } from 'react-native';
import { useTheme } from '../theme';
import { mentionParts } from './mentions';

export function MentionText({ text, known }: { text: string; known: string[] }) {
  const { dark } = useTheme();
  return (
    <>
      {mentionParts(text, known).map((part, i) => (
        <Text
          key={i}
          testID={part.id ? `mention-${part.id}` : undefined}
          style={part.id ? { color: dark ? '#7AA2FF' : '#245BD6' } : undefined}
        >
          {part.text}
        </Text>
      ))}
    </>
  );
}
