import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeContext, palettes } from '../src/theme';
import { PreviewSessionSheet } from '../src/preview/PreviewSessionSheet';
import { LivePreviewCard } from '../src/preview/LivePreviewCard';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { PreviewTarget } from '../src/preview/types';

const candidate: PreviewTarget = { grantId: 'a'.repeat(32), projectId: 'one', targetId: 'native-window:11:22:view',
  name: 'Generic native application', running: true, approvalRequired: true };
const events = { shares: 0, opens: 0, closes: 0, lists: 0 };
let mode = 'candidate';
let resolveShare: ((target: PreviewTarget) => void) | null = null;
const projects = [{ id: 'one', name: 'One', path: '/tmp/one' }, { id: 'two', name: 'Two', path: '/tmp/two' }];
const actions = { ...fixtureWorkspace.actions,
  listPreviews: async () => { events.lists++; return { targets: mode === 'candidate' ? [candidate] : [],
    windowHandoffV1: true, windowProblem: mode === 'permission' ? 'Allow Vibyra screen recording in Mac System Settings, then try again.' : undefined }; },
  shareWindowPreview: async () => { events.shares++; return new Promise<PreviewTarget>(resolve => { resolveShare = resolve; }); },
  startPreview: async () => ({ phase: 'running' }),
  openPreview: async () => { events.opens++; return { url: 'http://127.0.0.1:12345/', close: async () => { events.closes++; } }; },
};
function Fixture() {
  const [projectId, setProject] = useState('one');
  const [visible, setVisible] = useState(false);
  const [revision, setRevision] = useState(0);
  Object.assign(window, { handoff: { events,
    open: () => setVisible(true), close: () => setVisible(false),
    project: (id: string) => setProject(id),
    mode: (value: string) => { mode = value; setRevision(v => v + 1); },
    approve: () => { resolveShare?.({ ...candidate, grantId: 'b'.repeat(32), approvalRequired: false }); },
  } });
  const workspace = { ...fixtureWorkspace, status: 'connected' as const, previewAvailable: true,
    previewRevision: revision, projects, actions };
  return <ThemeContext.Provider value={{ colors: palettes.dark, dark: true }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <LivePreviewCard workspace={workspace} projectId={projectId} onPress={() => setVisible(true)} />
      <PreviewSessionSheet visible={visible} onClose={() => setVisible(false)} projectId={projectId} workspace={workspace} />
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
