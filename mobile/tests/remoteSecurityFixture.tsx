import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { palettes, ThemeContext } from '../src/theme';
import { CloudPermissionsStep } from '../src/connection/CloudPermissionsStep';
import { ConnectionProgress } from '../src/connection/ConnectionProgress';
const query = new URLSearchParams(location.search);
const dark = query.get('theme') === 'dark';
const state = query.get('state');
createRoot(document.getElementById('root')!).render(<ThemeContext.Provider value={{ colors: palettes[dark ? 'dark' : 'light'], dark }}>
  <View style={{ flex: 1, backgroundColor: palettes[dark ? 'dark' : 'light'].background }}>
    {state ? <View style={{ flex: 1, padding: 24 }}><ConnectionProgress name="Home Desktop" stage="connecting" cloud working
      security={state === 'approval' ? { stage: 'approval', pairingCode: '472831' } : { stage: 'authentication' }} /></View>
      : <CloudPermissionsStep name="Home Desktop" onBack={() => {}}
        onConnect={permissions => { (window as any).permissions = permissions; }} />}
  </View>
</ThemeContext.Provider>);
