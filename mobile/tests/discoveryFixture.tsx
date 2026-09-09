import React from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectingStep } from '../src/connection/ConnectingStep';
import { DiscoveryStep } from '../src/connection/DiscoveryStep';
import type { NearbyComputer } from '../src/connection/discoveryTypes';
import { palettes, ThemeContext } from '../src/theme';
import type { ConnectionStatus, WorkspaceModel } from '../src/ui/types';

declare global {
  interface Window { discoveryCalls: string[] }
}

const target: NearbyComputer = { id: 'Studio._vibyra-host._tcp.local.', name: 'Ellis’s Studio',
  hostId: 'ab'.repeat(32), host: '192.168.1.24', port: 4318 };
const connecting: Record<string, { status: ConnectionStatus; error?: string; settles: boolean }> = {
  handshake: { status: 'connecting', settles: false },
  approval: { status: 'pairing', settles: false },
  connected: { status: 'connected', settles: true },
  refused: { status: 'error', error: 'Pairing denied or expired', settles: true },
};

/** Design fixture for the nearby-computer flow. The native Bonjour module is
 *  replaced by a scripted adapter, and the workspace is a stub, so every screen
 *  can be inspected without a computer on the network. */
export function DiscoveryFixture() {
  const dark = (new URLSearchParams(window.location.search).get('theme') ?? 'dark') !== 'light';
  const state = new URLSearchParams(window.location.search).get('state') ?? 'searching';
  const colors = dark ? palettes.dark : palettes.light;
  window.discoveryCalls = window.discoveryCalls ?? [];
  const record = (call: string) => { window.discoveryCalls.push(call); };
  const stage = connecting[state];
  return <SafeAreaProvider><ThemeContext.Provider value={{ colors, dark }}>
    <View style={[s.frame, { backgroundColor: colors.surface }]}>
      <Text style={[s.label, { color: colors.muted }]}>Nearby computer fixture</Text>
      {stage ? <ConnectingStep computer={target} workspace={stub(stage, record)}
        onDone={() => record('done')} onSearch={() => record('search')} />
        : <DiscoveryStep onSelect={found => record(`select:${found.name}`)}
          onBack={() => record('back')} />}
    </View>
  </ThemeContext.Provider></SafeAreaProvider>;
}

function stub({ status, error, settles }: { status: ConnectionStatus; error?: string; settles: boolean },
  record: (call: string) => void): WorkspaceModel {
  return {
    status, error: error ?? null, host: null, projects: [], sessions: [], devices: [], approvals: [],
    selectedSessionId: null, output: '', themePreference: 'dark',
    onboarding: { status: 'complete', mode: 'computer' }, account: null,
    actions: {
      connect: link => {
        record(`connect:${JSON.parse(link).url}`);
        // An unsettled attempt stays pending, exactly as the transport does
        // while the computer holds the handshake for its owner to approve.
        if (!settles) return new Promise(() => {});
        return error ? Promise.reject(new Error(error)) : Promise.resolve();
      },
      disconnect: () => record('disconnect'),
      refresh: () => Promise.resolve(), selectSession: () => {}, sendInput: () => Promise.resolve(),
      createSession: () => Promise.resolve(), resize: () => {}, stopSession: () => Promise.resolve(),
      listFiles: () => Promise.resolve({ entries: [] }),
      readFile: () => Promise.resolve({ path: '', content: '', truncated: false }),
      getDiff: () => Promise.resolve({ diff: '', truncated: false }), setTheme: () => {},
    },
  };
}

const s = StyleSheet.create({
  frame: { flex: 1, width: '100%' },
  label: { fontSize: 11, letterSpacing: 0.4, textAlign: 'center', paddingTop: 10, paddingBottom: 2 },
});
