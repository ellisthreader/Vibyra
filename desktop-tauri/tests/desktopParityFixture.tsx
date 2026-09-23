import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@xterm/xterm/css/xterm.css';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { AuthScreen } from '../src/components/auth/AuthScreen';
import { FirstWelcome } from '../src/components/auth/FirstWelcome';
import { HomeView } from '../src/components/home/HomeView';
import { NewProjectPage } from '../src/components/home/NewProjectPage';
import { TitleBar } from '../src/components/layout/TitleBar';
import { ProjectStrip } from '../src/components/layout/ProjectStrip';
import { ProjectWorkspace } from '../src/components/layout/ProjectWorkspace';
import { TeammatesWorkspace } from '../src/components/teammates/TeammatesWorkspace';
import { SettingsModal } from '../src/components/settings/SettingsModal';
import { useProductMode } from '../src/state/productModeStore';
import { useProjectStore } from '../src/state/projectStore';
import { useAccountStore } from '../src/state/accountStore';
import { seedParityFixture, parityScreen } from './desktopParityState';
import { reportParityLayout } from './desktopParityMetrics';

// Deliberately mounts the shipping components. IPC and sample data are the
// only substitutes; these routes never open a real project or call a service.
seedParityFixture();
function Fixture() {
  const mode = useProductMode(s => s.mode);
  const view = useProjectStore(s => s.view);
  const [welcome, setWelcome] = useState(parityScreen === 'welcome');
  const profile = useAccountStore(s => s.snapshot.profile);
  if (parityScreen === 'auth') return <AuthScreen />;
  return <div className="app">
    <TitleBar />
    <div className="shell">
      <div className="product-code-shell" hidden={mode !== 'work'}>
        <ProjectStrip />
        {view === 'new-project' ? <NewProjectPage /> : view === 'home' ? <HomeView /> : <ProjectWorkspace active={mode === 'work'} />}
      </div>
      <TeammatesWorkspace active={mode === 'agent'} />
    </div>
    <SettingsModal />
    {welcome && profile && <FirstWelcome profile={profile} onFinish={() => setWelcome(false)} onHandoffStart={() => {}} />}
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
void reportParityLayout();
