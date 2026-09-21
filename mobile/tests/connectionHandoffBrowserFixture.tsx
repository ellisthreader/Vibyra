import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectFlow } from '../src/connection/ConnectFlow';
import { ConnectionModal } from '../src/connection/ConnectionModal';
import { palettes, ThemeContext } from '../src/theme';
import type { ConnectionStatus } from '../src/ui/types';
import { fixtureWorkspace } from './conversationWorkspaceFixture';

declare global { interface Window { handoffCalls: string[]; approveHandoff: () => void } }
function Fixture() {
  const dark = new URLSearchParams(location.search).get('theme') !== 'light';
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const [open, setOpen] = useState(true);
  const pending = useRef<() => void>(() => {});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  window.handoffCalls ??= [];
  window.approveHandoff = () => { window.handoffCalls.push('approved'); setStatus('connected'); pending.current(); };
  const workspace = { ...fixtureWorkspace, host: null, status, actions: { ...fixtureWorkspace.actions,
    connect: async () => {
      window.handoffCalls.push('connect'); setStatus('connecting');
      timer.current = setTimeout(() => setStatus('pairing'), 400);
      await new Promise<void>(resolve => { pending.current = resolve; });
    },
    disconnect: () => { window.handoffCalls.push('disconnect'); clearTimeout(timer.current); setStatus('offline'); pending.current(); },
  } };
  return <SafeAreaProvider><ThemeContext.Provider value={{ colors: palettes[dark ? 'dark' : 'light'], dark }}>
    <View style={{ flex: 1 }}>
      {open && <ConnectionModal onClose={() => setOpen(false)}>{dismiss =>
        <ConnectFlow workspace={workspace} onClose={() => { window.handoffCalls.push('done'); dismiss(); }} />
      }</ConnectionModal>}
    </View>
  </ThemeContext.Provider></SafeAreaProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
