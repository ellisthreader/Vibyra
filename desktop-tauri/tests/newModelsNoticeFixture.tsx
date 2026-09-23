import '@fontsource-variable/inter';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { HomeView } from '../src/components/home/HomeView';
import { NewModelsNotice } from '../src/components/home/NewModelsNotice';
import { ProjectStrip } from '../src/components/layout/ProjectStrip';
import { TitleBar } from '../src/components/layout/TitleBar';
import { useAccountStore } from '../src/state/accountStore';
import { useProjectStore } from '../src/state/projectStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useTerminalStore } from '../src/state/terminalStore';
import { usePhoneStore } from '../src/state/phoneStore';
import { openNewProject } from '../src/state/newProject';
import { newModelsNoticeHidden } from '../src/lib/newModelsNotice';

document.documentElement.dataset.platform = 'mac';
document.documentElement.dataset.theme = 'dark';
mockWindows('main');
mockIPC(() => null);
const now = Date.now();
const names = ['HKE', 'Vibyra', 'Applications', 'Desktop', 'Bear-Lane', 'PortfolioWebsite'];
const projects = names.map((name, index) => ({
  id:name.toLowerCase(), name, root:`/Users/ellis/Desktop/${name}`,
  color:'#52647e', lastOpenedMs:now-index*3600000,
}));
useAccountStore.setState({ snapshot:{ status:'signedIn', profile:{ name:'Ellis', email:'ellis@example.test', plan:'free' }, secureStorage:true, error:null, pendingProvider:null } as any });
useSettingsStore.setState({ settings:{ projects, theme:'dark', fontSize:13 } as any });
useProjectStore.setState({ homeDir:'/Users/ellis', view:'home', activeId:null });
useTerminalStore.setState({ panes:[], activity:{} });
usePhoneStore.setState({ status:{ enabled:false, discoverable:false, active:[], devices:[], pending:[], error:null, address:'' } });
Object.assign(window, { projectView:() => useProjectStore.getState().view });

function Fixture() {
  const [open, setOpen] = useState(() => !newModelsNoticeHidden());
  return <div className="app app--home" style={{height:'100vh'}}>
    <TitleBar /><div className="shell"><div className="product-code-shell"><ProjectStrip /><HomeView /></div></div>
    {open && <NewModelsNotice onClose={() => setOpen(false)} onStart={() => { setOpen(false); openNewProject(); }} />}
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
