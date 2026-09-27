import { useEffect, useRef } from 'react';
import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { Text, View } from 'react-native';
import { localDiscovery } from '../src/connection/localDiscovery';
import { isConnectable, nearbyPairingLink } from '../src/connection/nearbyPairing';
import { RpcClient } from '../src/transport/RpcClient';
import { RuntimeBridge } from '../src/transport/RuntimeBridge';
import type { BridgeHandle } from '../src/transport/Bridge.types';

const port = Constants.expoConfig?.extra?.nativeNearbyFixturePort ?? 8099;
const endpoint = `http://127.0.0.1:${port}`;
const post = (path: string, body: object) => fetch(`${endpoint}/${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}).catch(() => {});

/** The actual iOS WebView and Noise transport, with no workspace writes. */
function NativeNearbyConnectionFixture() {
  const bridge = useRef<BridgeHandle>(null);
  const rpc = useRef<RpcClient | null>(null);
  if (!rpc.current) rpc.current = new RpcClient(message => bridge.current?.post(message), randomUUID);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let active = true;
    let stopSearch: (() => void) | undefined;
    void fetch(`${endpoint}/config`).then(response => response.json()).then((config: { hostId: string }) => {
      if (!active) return;
      stopSearch = localDiscovery.start(update => {
        const computer = update.computers.find(candidate =>
          candidate.hostId === config.hostId && isConnectable(candidate));
        if (!computer || !active) return;
        active = false;
        stopSearch?.();
        void post('event', { stage: 'found', hostId: computer.hostId, address: computer.host, port: computer.port });
        void (async () => {
          const client = rpc.current!;
          const privateKey = await client.createKeypair();
          void post('event', { stage: 'opening' });
          await client.open(JSON.parse(nearbyPairingLink(computer)), privateKey);
          const state = await client.request<{ protocol: number; host: { id: string; name: string } }>('host.state');
          void post('result', { stage: 'connected', hostId: state.host.id, name: state.host.name,
            protocol: state.protocol, discoveredHostId: computer.hostId,
            nearby: JSON.parse(nearbyPairingLink(computer)).nearby });
          client.close();
        })().catch(error => { void post('result', { error: String(error) }); });
      });
    }).catch(error => { void post('result', { error: String(error) }); });
    return () => { active = false; stopSearch?.(); rpc.current?.close(); };
  }, []);
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#11151d' }}>
    <RuntimeBridge ref={bridge} onMessage={notice => rpc.current?.receive(notice)} />
    <Text style={{ color: 'white' }}>Native nearby connection QA</Text>
  </View>;
}
registerRootComponent(NativeNearbyConnectionFixture);
