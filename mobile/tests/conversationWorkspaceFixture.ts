import type { Session, WorkspaceModel } from '../src/ui/types';

export const fixtureSession: Session = { id: 'fixture-conversation', projectId: 'fixture-project',
  title: 'Welcome screen', kind: 'codex', runner: 'conversation', status: 'running', createdAt: '2026-09-09T10:00:00Z' };
const noop = async () => {};
export const fixtureWorkspace: WorkspaceModel = {
  status: 'connected', control: 'ready', error: null, host: { id: 'fixture-host', name: 'Fixture Mac', platform: 'macos' },
  projects: [{ id: 'fixture-project', name: 'Pocket', path: '/projects/pocket', branch: 'main' }],
  sessions: [fixtureSession], devices: [], approvals: [], selectedSessionId: fixtureSession.id,
  output: '', themePreference: 'dark', onboarding: { status: 'complete', mode: 'computer' }, account: null,
  conversation: { sessionId: fixtureSession.id, projectId: 'fixture-project', generation: 'fixture-generation',
    cursor: 4, hasMore: false, processState: 'running', turnState: 'waiting', turnId: 'fixture-turn', items: [
      { id: 'u', turnId: 'fixture-turn', kind: 'message', role: 'user', status: 'completed', text: 'Make the welcome screen feel simpler.' },
      { id: 'a', turnId: 'fixture-turn', kind: 'message', role: 'assistant', status: 'completed',
        text: 'I found the welcome screen. I’m refining the spacing and keeping the main action easy to reach.' },
      { id: 'read', turnId: 'fixture-turn', kind: 'activity', title: 'Reading files', status: 'completed', detail: 'cat src/Welcome.tsx' },
      { id: 'permission', turnId: 'fixture-turn', kind: 'permission', status: 'pending',
        title: 'Run the welcome screen checks', text: 'Verify the updated layout before finishing.',
        scope: '/projects/pocket', detail: 'npm run test -- welcome' },
    ] },
  actions: { connect: noop, disconnect: noop, refresh: noop, selectSession: () => {},
    createSession: async () => fixtureSession, sendInput: noop, resize: noop, stopSession: noop,
    listFiles: async () => ({ entries: [] }), readFile: async (_project, path) => ({ path, content: '', truncated: false }),
    getDiff: async () => ({ diff: '', truncated: false }), setTheme: () => {},
    submitTurn: noop, interruptTurn: noop, resolveDecision: noop, answerQuestion: noop },
};
