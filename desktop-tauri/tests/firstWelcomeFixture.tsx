import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { FirstWelcome } from '../src/components/auth/FirstWelcome';
import { HomeView } from '../src/components/home/HomeView';
import { TitleBar } from '../src/components/layout/TitleBar';
import { ProjectStrip } from '../src/components/layout/ProjectStrip';
import { useSettingsStore } from '../src/state/settingsStore';
import { useAccountStore } from '../src/state/accountStore';
import { useProjectStore } from '../src/state/projectStore';
import { useProductMode } from '../src/state/productModeStore';
import type { AccountProfile } from '../src/types';
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get('theme') || 'dark';
document.documentElement.dataset.platform = 'mac';
mockWindows('main');
mockIPC(() => null);
const profile = { name:query.get('name') || 'Ellis', email:'sample@example.test', welcomeKey:'welcome-design-fixture' } as AccountProfile;
useSettingsStore.setState({settings:{projects:[],theme:query.get('theme') || 'dark',agentView:'terminal'} as any});
useAccountStore.setState({snapshot:{status:'signedIn',profile,secureStorage:true,error:null,pendingProvider:null} as any});
useProjectStore.setState({view:'home'});
useProductMode.setState({mode:'work'});
function Fixture() {
  const [open, setOpen] = useState(!query.has('test'));
  const [handoff, setHandoff] = useState(false);
  return <div className={`app${handoff ? ' app--welcome-handoff' : ''}`}>
    <TitleBar />
    {query.has('test') && <button type="button" style={{position:'absolute',top:10,right:350,zIndex:41}} onClick={() => {setHandoff(false);setOpen(true);}}>Replay intro fixture</button>}
    <div className="shell"><div className="product-code-shell"><ProjectStrip /><HomeView /></div></div>
    {open && <FirstWelcome profile={profile} onFinish={() => setOpen(false)} onHandoffStart={() => setHandoff(true)} />}
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
