import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PairLinkSheet } from '../src/connection/PairLinkSheet';
import { usePairLink } from '../src/state/usePairLink';
import { workspacePalette } from '../src/ui/workspacePalette';
import { hostState, pairing, runtimeHarness } from './runtimeHarness';

/**
 * F-29 fixture: the real store and `usePairLink` behind the real `PairLinkSheet`, with a fake
 * transport. `pairFixture.receive(url)` is what the app does when a `vibyra://pair` link arrives.
 */
const theme = new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark';
const h = runtimeHarness();
let opened = pairing.hostId;
// A computer answers `host.state` under its own id, so a switch to another one completes.
h.handle(message => {
  if (message.type === 'open') opened = message.pairing.hostId;
  if (message.type === 'send' && message.payload.method === 'host.state') {
    const name = opened === pairing.hostId ? pairing.name : 'Attacker Mac';
    h.reply(message, { ...structuredClone(hostState), host: { ...hostState.host, id: opened, name } });
    return true;
  }
  return false;
});
function Fixture() {
  const state = useSyncExternalStore(h.store.subscribe, h.store.snapshot, h.store.snapshot);
  const pair = usePairLink(h.store);
  const colors = workspacePalette(theme === 'dark');
  Object.assign(window, { pairFixture: { receive: pair.receive,
    opens: () => h.sent.filter(m => m.type === 'open').length, saved: () => h.store.saved?.pairing.hostId ?? null,
    projects: () => h.store.state.projects.length, status: () => state.status, error: () => state.error } });
  return <SafeAreaProvider>
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 24, gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>This phone is paired with</Text>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>
        {state.status === 'connected' ? (h.store.saved?.pairing.name ?? '') : state.status}
      </Text>
    </View>
    <PairLinkSheet held={pair.held} replaces={pair.replaces} themePreference={theme}
      onPair={pair.accept} onCancel={pair.cancel} />
  </SafeAreaProvider>;
}
void h.store.actions.connect(JSON.stringify(pairing)).then(() => createRoot(document.getElementById('root')!).render(<Fixture />));
