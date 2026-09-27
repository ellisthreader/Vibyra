import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { PreviewSessionSheet } from '../src/preview/PreviewSessionSheet';
import type { WorkspaceModel } from '../src/ui/types';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

const events = { opens: 0, closes: 0 };
const actions = {
  ...fixtureWorkspace.actions,
  startPreview: async () => ({ phase: 'running' }),
  openPreview: async () => {
    events.opens++;
    return {
      url: 'http://127.0.0.1:12345/',
      close: async () => { events.closes++; },
    };
  },
};
const target = (projectId: string) => ({
  grantId: 'a'.repeat(32), projectId, targetId: 'auto-port:5173', running: true,
});

function Fixture() {
  const [projectId, setProjectId] = useState('one');
  const [projects, setProjects] = useState([{ id: 'one', name: 'One', path: '/tmp/one' },
    { id: 'two', name: 'Two', path: '/tmp/two' }]);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    Object.assign(window, { previewProjectUpdates:
      ((window as unknown as { previewProjectUpdates?: number }).previewProjectUpdates ?? 0) + 1 });
  }, [projects]);
  Object.assign(window, {
    previewEvents: events,
    refreshPreviewProjects: () => setProjects(previous => previous.map(project => ({ ...project }))),
    switchPreviewProject: () => setProjectId('two'),
    closePreviewSheet: () => setVisible(false),
  });
  const workspace: WorkspaceModel = {
    // Real adapters can wrap the same actions on every snapshot.
    ...fixtureWorkspace, status: 'connected', projects, actions: { ...actions },
  };
  return <ThemeContext.Provider value={{ colors: palettes.dark, dark: true }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <PreviewSessionSheet visible={visible} onClose={() => setVisible(false)}
        projectId={projectId} workspace={workspace} known={target(projectId)} />
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
