import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { LivePreviewCard } from '../src/preview/LivePreviewCard';
import { PreviewSessionSheet } from '../src/preview/PreviewSessionSheet';
import { useLivePreviewTarget, type LivePreviewTarget } from '../src/preview/useLivePreviewTarget';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

const site = { grantId: 'a'.repeat(32), projectId: 'site', targetId: 'auto-port:5173', running: true };
const stopped = { grantId: 'b'.repeat(32), projectId: 'other', targetId: 'attached-port:8001', running: false };
const events = { opens: [] as string[], starts: [] as string[], closes: 0 };
let targets: LivePreviewTarget[] = [site, stopped];
let hold = false;
const pending: (() => void)[] = [];
const actions = {
  ...fixtureWorkspace.actions,
  listPreviews: () => {
    const snapshot = [...targets];
    return new Promise<{ targets: LivePreviewTarget[] }>(resolve => {
      if (hold) pending.push(() => resolve({ targets: snapshot }));
      else resolve({ targets: snapshot });
    });
  },
  startPreview: async (grant: string) => { events.starts.push(grant); return { phase: 'running' }; },
  openPreview: async (grant: string) => {
    events.opens.push(grant);
    return { url: 'http://127.0.0.1:12345/', close: async () => { events.closes++; } };
  },
};

function Fixture() {
  const [projectId, setProjectId] = useState('site');
  const [revision, setRevision] = useState(0);
  const [visible, setVisible] = useState(false);
  const [aliasPath, setAliasPath] = useState('/Users/ellis/Desktop/Site');
  const workspace = { ...fixtureWorkspace, actions, previewAvailable: true, previewRevision: revision,
    projects: [{ id: 'site', name: 'Site', path: '~/Desktop/Site' },
      { id: 'other', name: 'Other', path: '/Users/ellis/Desktop/Other' },
      { id: 'alias', name: 'Alias', path: aliasPath }] };
  const target = useLivePreviewTarget(workspace, projectId);
  useEffect(() => { Object.assign(window, {
    scopeEvents: events,
    scopeControl: {
      project: (id: string) => { setVisible(false); setProjectId(id); },
      hold: () => { hold = true; setRevision(value => value + 1); },
      pending: () => pending.length,
      release: () => { hold = false; pending.splice(0).forEach(resolve => resolve()); },
      moveAlias: () => setAliasPath('/Users/ellis/Desktop/Other'),
      show: () => setVisible(true),
      close: () => setVisible(false),
      stop: () => { targets = [stopped]; setRevision(value => value + 1); },
    },
  }); });
  return <ThemeContext.Provider value={{ colors: palettes.dark, dark: true }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <div data-testid="project">{projectId}</div>
      {target && <button data-testid="preview-header" onClick={() => setVisible(true)}>Preview</button>}
      <LivePreviewCard workspace={workspace} projectId={projectId} onPress={() => setVisible(true)} />
      <PreviewSessionSheet visible={visible} onClose={() => setVisible(false)}
        projectId={projectId} workspace={workspace} known={site} />
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
