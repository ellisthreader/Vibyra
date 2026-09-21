import { useState } from 'react';
import { Platform, Pressable, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeContext, palettes } from '../src/theme';
import { ConversationView } from '../src/conversation/ConversationView';

export const summaryTable = `| Area | What changed |
|---|---|
| Thinking | One active indicator instead of competing indicators. |
| Activity | Tool steps and progress updates collapse into expandable work details. |
| Responses | Thinking transitions cleanly into streaming text. |
| Composer | Removed the extra animated glow and busy caption. |
| Stop and drafts | Enlarged Stop and preserved your next draft during generation. |
| Keyboard | Fixed the streaming indicator being partially hidden when the keyboard opens. |
| Verification | Checked native iPhone Simulator, both themes, screen sizes, and Reduce Motion; physical iPhone testing remains pending. |`;
export const wideTable = '| Name | Format | Link | Result |\n| :--- | :---: | --- | ---: |\n| **One** | `a \\| b` | [Docs](https://example.com) | 100 |\n| Two | text | No link | 200 |';
export function ConversationTableFixture({ initialDark = true }: { initialDark?: boolean }) {
  const [dark, setDark] = useState(initialDark);
  const [wide, setWide] = useState(false);
  const [partial, setPartial] = useState(false);
  const colors = dark ? palettes.dark : palettes.light;
  const Frame = Platform.OS === 'ios' ? SafeAreaView : View;
  const markdown = wide ? wideTable : summaryTable;
  return <ThemeContext.Provider value={{ colors, dark }}><Frame style={{ flex: 1, backgroundColor: colors.background }}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
    <View style={{ height: 64, paddingHorizontal: 20, flexDirection: 'row', gap: 16, alignItems: 'center' }}>
      {[['Theme', () => setDark(!dark)], ['Wide table', () => setWide(!wide)], ['Stream row', () => setPartial(!partial)]] .map(([title, action]) =>
        <Pressable key={String(title)} accessibilityRole="button" accessibilityLabel={String(title)} onPress={action as () => void} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.text }}>{String(title)}</Text></Pressable>)}
    </View>
    <ConversationView memoryKey="table-fixture" status={partial ? 'working' : 'idle'} connected canRespond turnId="t"
      onDecision={async () => {}} onAnswer={async () => {}}
      items={[{ kind: 'message', id: 'u', turnId: 't', role: 'user', text: 'Show me what you did in a table.' },
        { kind: 'message', id: 'a', turnId: 't', role: 'assistant', text: partial ? markdown.slice(0, -35) : markdown }]} />
  </Frame></ThemeContext.Provider>;
}
