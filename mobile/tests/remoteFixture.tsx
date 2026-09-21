import React from 'react';
import { View } from 'react-native';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { ComputersScreen } from '../src/ui/ComputersScreen';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { WorkspaceModel } from '../src/ui/types';

// The Remote page for one paired computer. `address` is the pairing's host:port,
// `status` the connection (`reconnecting=1` adds the ladder between attempts,
// `error` the message the last attempt left), `platform` what the Host reports,
// and `host=none` is a phone with no computer at all. `geo` is what the lookup
// service says: `ok` answers with a city, `country` with a country alone, `fail`
// never answers usefully, `pending` never answers at all, and `live` leaves the
// real service in place. Every lookup the page makes is recorded on `window.lookups`.
const query = new URLSearchParams(location.search);
const dark = query.get('theme') !== 'light';
const geo = query.get('geo') ?? 'ok';
const lookups: string[] = [];
(window as unknown as { lookups: string[] }).lookups = lookups;
if (geo !== 'live') window.fetch = async input => {
  lookups.push(String(input));
  if (geo === 'pending') return new Promise<Response>(() => {});
  if (geo === 'fail') return new Response('busy', { status: 503 });
  const body = geo === 'country' ? { country: 'United States', country_code: 'US' }
    : { ip: '2001:db8:4a2f:10:6da1:3d15:e37f:100d', city: 'Manchester', region: 'England', country: 'United Kingdom', country_code: 'GB' };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};

const status = (query.get('status') ?? 'connected') as WorkspaceModel['status'];
const workspace: WorkspaceModel = { ...fixtureWorkspace,
  status, reconnecting: query.get('reconnecting') === '1', error: query.get('error'),
  host: query.get('host') === 'none' ? null
    : { id: 'fixture-host', name: query.get('name') ?? 'Studio Mac', platform: query.get('platform') ?? 'macos', version: '0.1.10' },
  hostAddress: query.get('address') ?? '192.168.1.24:4318',
  actions: { ...fixtureWorkspace.actions, reconnect: async () => {}, forgetDevice: async () => {}, sendHostLink: async () => 'you@example.com' } };

createRoot(document.getElementById('root')!).render(
  <ThemeContext.Provider value={{ colors: dark ? palettes.dark : palettes.light, dark }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <View style={{ flex: 1, backgroundColor: (dark ? palettes.dark : palettes.light).background }}>
        <ComputersScreen workspace={workspace} />
      </View>
    </SafeAreaProvider>
  </ThemeContext.Provider>);
