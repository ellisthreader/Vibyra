/** Production mobile screens with sample identity and a fully local handshake. */
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectionModal } from '../src/connection/ConnectionModal';
import { ConnectFlow } from '../src/connection/ConnectFlow';
import { ComputersScreen } from '../src/ui/ComputersScreen';
import { palettes, ThemeContext } from '../src/theme';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { ConnectionStatus } from '../src/ui/types';

const dark = new URLSearchParams(location.search).get('theme') !== 'light';
window.fetch = async () => new Response(JSON.stringify({ city:'Manchester', country:'United Kingdom', country_code:'GB' }));
function Fixture() {
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const [open, setOpen] = useState(true);
  const resolve = useRef(() => {});
  Object.assign(window, { approveWelcomePhone: () => { setStatus('connected'); resolve.current(); } });
  const workspace = { ...fixtureWorkspace, status,
    host: status === 'connected' ? {id:'sample-mac',name:'Studio Mac',platform:'macos',version:'0.7.8'} : null,
    hostAddress:'192.168.1.24:4318', throughCloud:false,
    actions: { ...fixtureWorkspace.actions, connect: async () => {
      setStatus('connecting'); setTimeout(() => setStatus('pairing'), 700);
      await new Promise<void>(done => { resolve.current = done; });
    }, disconnect: () => {}, reconnect:async () => {}, forgetDevice:async () => {} } };
  return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:780},insets:{top:0,bottom:0,left:0,right:0}}}>
    <ThemeContext.Provider value={{colors:palettes[dark ? 'dark':'light'],dark}}>
      <View style={{flex:1,backgroundColor:palettes[dark ? 'dark':'light'].background}}>
        {status === 'connected' && <ComputersScreen workspace={workspace} />}
        {open && <ConnectionModal onClose={() => setOpen(false)}>{dismiss => <ConnectFlow workspace={workspace} onClose={dismiss} />}</ConnectionModal>}
      </View>
    </ThemeContext.Provider>
  </SafeAreaProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
