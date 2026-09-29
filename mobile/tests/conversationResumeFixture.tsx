import { useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ConversationSessionScreen } from '../src/ui/ConversationSessionScreen';
import { ThemeContext, palettes } from '../src/theme';
import { VibesProvider } from '../src/vibes/VibesProvider';
import { sampleVibesApi } from '../src/demo/sampleVibes';
import { fixtureSession, fixtureWorkspace } from './conversationWorkspaceFixture';
import type { WorkspaceModel } from '../src/ui/types';

export function ConversationResumeFixture({ dark = true, mode = '' }: { dark?: boolean; mode?: string }) {
  const [running, setRunning] = useState(false);
  const [sent, setSent] = useState('');
  const session = { ...fixtureSession, status: running ? 'running' as const : 'interrupted' as const,
    canInput: mode !== 'typing-off' };
  const resume = async () => {
    if (mode === 'failure') throw new Error('Could not restore the saved thread. Your draft is kept.');
    setRunning(true);
  };
  const workspace: WorkspaceModel = { ...fixtureWorkspace,
    status: mode === 'offline' ? 'offline' : 'connected', control: running ? 'ready' : 'readonly', sessions: [session],
    conversation: { ...fixtureWorkspace.conversation!, canResume: mode !== 'legacy', processState: session.status,
      turnState: 'idle', items: [...fixtureWorkspace.conversation!.items.slice(0, 2), ...(sent ? [{
        id: 'next', turnId: 'next', kind: 'message' as const, role: 'user' as const, status: 'completed', text: sent,
      }] : [])] },
    actions: { ...fixtureWorkspace.actions, resumeConversation: resume,
      submitTurn: async text => { await resume(); setSent(text); } },
  };
  return <SafeAreaProvider><VibesProvider api={sampleVibesApi} identity="resume-preview" purchases={null}>
    <ThemeContext.Provider value={{ colors: dark ? palettes.dark : palettes.light, dark }}>
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: (dark ? palettes.dark : palettes.light).background }}>
        <ConversationSessionScreen session={session} workspace={workspace} options={false} onCloseOptions={() => {}} />
      </SafeAreaView>
    </ThemeContext.Provider>
  </VibesProvider></SafeAreaProvider>;
}
