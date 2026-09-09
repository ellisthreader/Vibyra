import { useRef, useState } from 'react';
import type { Account, Session, ThemePreference } from '../ui/types';
import { approvals, conversations, demoDiff, demoFile, projects, sessions, type DemoMessage, type DemoWorkspace } from './data';

export function useDemoWorkspace({ account, themePreference, setTheme, exitDemo }: {
  account: Account | null; themePreference: ThemePreference; setTheme: (value: ThemePreference) => void; exitDemo: () => void;
}): DemoWorkspace {
  const [items, setItems] = useState(sessions);
  const [selected, select] = useState<string | null>(null);
  const [decisions, setDecisions] = useState(approvals);
  const [threads, setThreads] = useState(conversations);
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const terminalIntro = 'Vibyra · sample terminal\r\nNo commands run in demo mode.\r\n';
  const serial = useRef(0);
  const push = (id: string, messages: DemoMessage[]) => setThreads(current => ({ ...current, [id]: [...(current[id] ?? []), ...messages] }));
  return {
    demo: true, status: 'connected', error: null, host: { id: 'demo-host', name: 'Studio Mac', platform: 'macOS · Example computer' },
    projects, sessions: items, devices: [{ id: 'demo-phone', name: 'Your iPhone', current: true }], approvals: decisions,
    selectedSessionId: selected, output: selected ? outputs[selected] ?? terminalIntro : '', themePreference, messages: selected ? threads[selected] ?? [] : [],
    onboarding: { status: 'complete', mode: null }, account,
    actions: {
      setTheme, exitDemo, connect: async () => { throw new Error('Leave the demo to connect your own computer.'); },
      // Nothing was saved for the demo account, so logging out is exactly leaving the sample workspace.
      logOut: account ? async () => { exitDemo(); } : undefined,
      disconnect: exitDemo, refresh: async () => {}, resize: () => {}, selectSession: select,
      createSession: async (projectId, kind, title) => {
        const id = `demo-new-${++serial.current}`;
        const session: Session = { id, projectId, kind, title, status: 'running', createdAt: new Date().toISOString() };
        setItems(current => [session, ...current]);
        setThreads(current => ({ ...current, [id]: [] }));
        select(id);
        return session;
      },
      sendInput: async value => {
        if (!selected) throw new Error('Open a chat or terminal first.');
        const text = value.replace(/\r/g, '').trim();
        if (!text) return;
        const id = `message-${++serial.current}`;
        push(selected, [{ id, role: 'user', text }, { id: `${id}-reply`, role: 'assistant',
          text: 'Sample response — your instruction is saved in this conversation. Connect your computer to run it against your project.', result: true }]);
        setOutputs(current => ({ ...current, [selected]: `${current[selected] ?? terminalIntro}\r\n$ ${text}\r\nSample only — command not executed.\r\n` }));
      },
      stopSession: async id => {
        setItems(current => current.map(item => item.id === id ? { ...item, status: 'interrupted' } : item));
        push(id, [{ id: `stop-${++serial.current}`, role: 'assistant', text: 'Session stopped. Conversation retained.' }]);
      },
      listFiles: async (_id, path) => ({ entries: path === '' ? [
        { path: 'src', name: 'src', kind: 'directory', size: 0 },
        { path: 'README.md', name: 'README.md', kind: 'file', size: 184 },
        { path: 'package.json', name: 'package.json', kind: 'file', size: 320 },
      ] : [{ path: 'src/checkout.tsx', name: 'checkout.tsx', kind: 'file', size: demoFile.length }] }),
      readFile: async (_id, path) => ({ path, content: path.endsWith('checkout.tsx') ? demoFile : path.endsWith('package.json')
        ? '{\n  "name": "studio-demo",\n  "scripts": { "check": "tsc --noEmit" }\n}\n'
        : '# Studio\n\nSample project.\nNo real computer is connected.\n', truncated: false }),
      getDiff: async () => ({ diff: demoDiff, truncated: false }),
      resolveApproval: async (id, allow) => {
        setDecisions(current => current.filter(item => item.id !== id));
        push('demo-shortcuts', [{ id: `decision-${++serial.current}`, role: 'assistant', text: allow
          ? 'You approved the sample command once. In this example, lint and type checks passed.'
          : 'You declined the sample command. The example checks were not run.', result: allow }]);
        setItems(current => current.map(item => item.id === 'demo-shortcuts' ? { ...item, status: 'exited', exitCode: allow ? 0 : 1 } : item));
      },
    },
  };
}
