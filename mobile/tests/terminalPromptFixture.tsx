import { createRoot } from 'react-dom/client';
import { Text, View } from 'react-native';
import { ThemeContext, palettes } from '../src/theme';
import { TerminalPromptBar } from '../src/ui/TerminalPromptBar';

declare global { var promptKeys: string[] }
globalThis.promptKeys = [];
const query = new URLSearchParams(location.search);
const state = query.get('state') ?? 'ready';
const codex = query.get('provider') === 'codex';
const dark = query.get('theme') !== 'light';
const colors = dark ? palettes.dark : palettes.light;
// The prompt a real Claude Code 2.1 session drew (see promptChoices.test.ts).
const claudePrompt = { question: 'Do you want to proceed?', options: [
  { label: 'Yes', keys: '1' },
  { label: 'Yes, and always allow access to ~/pocket from this project', keys: '2' },
  { label: 'No', keys: '3' },
] };
const codexPrompt = { question: 'Would you like to run the following command?',
  context: 'Environment: local\nReason: Let your iPhone open the website?\n$ HKE_ALLOW_LAN=1 npm run start:website',
  options: [
    { label: 'Yes, proceed (y)', keys: 'y' },
    { label: "Yes, and don't ask again for this command (p)", keys: 'p' },
    { label: 'No, and tell Codex what to do differently (esc)', keys: '\x1b' },
  ] };
const blocked = state === 'observer'
  ? { reason: 'Your Mac is in control of this terminal.', action: { label: 'Take control to answer', onPress: () => { globalThis.promptKeys.push('claim'); } } }
  : state === 'typing-off' ? { reason: 'Typing from your phone is off. Turn it on in Vibyra on your Mac: Settings › iPhone connection.' }
  : undefined;
createRoot(document.getElementById('root')!).render(<ThemeContext.Provider value={{ colors, dark }}>
  <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ flex: 1, margin: 12, borderRadius: 12, backgroundColor: colors.workspace, padding: 12 }}>
      <Text style={{ color: colors.muted, fontFamily: 'Menlo', fontSize: 12 }}>{codex
        ? 'Would you like to run the following command?\n\nEnvironment: local\nReason: Let your iPhone open the website?\n$ HKE_ALLOW_LAN=1 npm run start:website\n\n❯ 1. Yes, proceed (y)\n  2. Yes, and don\'t ask again (p)\n  3. No (esc)'
        : 'Bash command\n\n  echo vibyra > probe.txt\n\nDo you want to proceed?\n❯ 1. Yes\n  2. Yes, and always allow…\n  3. No'}</Text>
    </View>
    <TerminalPromptBar prompt={codex ? codexPrompt : claudePrompt} blocked={blocked} onChoose={async keys => { globalThis.promptKeys.push(keys); }} />
    <View style={{ height: 70 }} />
  </View>
</ThemeContext.Provider>);
