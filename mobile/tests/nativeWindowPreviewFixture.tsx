// Dedicated QA bundle only. Its endpoint contains a short-lived random path.
import { useEffect, useRef, useState } from 'react';
import { registerRootComponent } from 'expo';
import { randomUUID } from 'expo-crypto';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { SafeAreaView, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { HttpProxyController, type NativePreviewProxy } from '../src/preview/HttpProxyController';
import { RuntimeBridge } from '../src/transport/RuntimeBridge';
import type { BridgeHandle } from '../src/transport/Bridge.types';
import { RpcClient } from '../src/transport/RpcClient';
import { parsePairing } from '../src/transport/pairing';

const endpoint = process.env.EXPO_PUBLIC_WINDOW_QA_URL;
const native = requireOptionalNativeModule<NativePreviewProxy>('VibyraPreviewProof');
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function Fixture() {
  const bridge = useRef<BridgeHandle>(null);
  const rpc = useRef(new RpcClient(message => bridge.current?.post(message), randomUUID)).current;
  const proxy = useRef<HttpProxyController | null>(null);
  const seen = useRef({ frameRequests: 0, ready: false, isolation: false, maxRpcMs: 0, openedAt: 0, firstFrameMs: 0 });
  const reporting = useRef(false);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('Connecting to the synthetic Mac window…');
  const report = async (result: object) => {
    await fetch(`${endpoint}/result`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(result) });
  };
  useEffect(() => {
    let active = true;
    const listener = native?.addListener('onPreviewRequest', event => {
      if (event.path.startsWith('/frame')) seen.current.frameRequests++;
    });
    void (async () => {
      if (!endpoint || !native) throw new Error('Missing isolated QA endpoint or native Preview module');
      let config: { pairUri?: string } = {};
      for (let i = 0; i < 120 && !config.pairUri; i++) {
        config = await fetch(`${endpoint}/config`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        if (!config.pairUri) await pause(500);
      }
      await rpc.open(parsePairing(config.pairUri!), await rpc.createKeypair());
      let targets: { targets: { grantId: string; targetId: string }[] } = { targets: [] };
      for (let i = 0; i < 40 && !targets.targets.length; i++) {
        targets = await rpc.request('preview.list', { windowV1: true });
        if (!targets.targets.length) await pause(250);
      }
      const target = targets.targets[0];
      if (!target?.targetId.startsWith('native-window:')) throw new Error('No synthetic window grant');
      const opened = await rpc.request<{ generation: string }>('preview.open', { grantId: target.grantId });
      proxy.current = new HttpProxyController(rpc, native, opened.generation);
      const next = await proxy.current.start();
      seen.current.isolation = (await fetch(new URL(next).origin)).status === 403;
      seen.current.openedAt = Date.now();
      if (active) setUrl(next);
    })().catch(cause => { setStatus(String(cause)); void report({ error: String(cause) }); });
    return () => { active = false; listener?.remove(); void proxy.current?.close(); rpc.close(); };
  }, [rpc]);
  const ready = () => {
    if (reporting.current) return;
    reporting.current = true; seen.current.ready = true;
    seen.current.firstFrameMs = Date.now() - seen.current.openedAt;
    setStatus('Live native Mac window · encrypted connection');
    void (async () => {
      for (let i = 0; i < 10; i++) {
        const start = Date.now(); await rpc.request('session.list');
        seen.current.maxRpcMs = Math.max(seen.current.maxRpcMs, Date.now() - start);
        await pause(300);
      }
      await report({ outcome: 'drawn', ...seen.current });
    })().catch(cause => void report({ error: String(cause), ...seen.current }));
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#15171c' }}>
    <RuntimeBridge ref={bridge} onMessage={rpc.receive} />
    <Text style={{ color: 'white', padding: 16 }}>{status}</Text>
    {url ? <WebView source={{ uri: url }} incognito originWhitelist={['*']}
      onMessage={({ nativeEvent }) => {
        try { const event = JSON.parse(nativeEvent.data); if (event.preview === 1 && event.kind === 'ready') ready(); } catch { /* untrusted page notice */ }
      }} onError={({ nativeEvent }) => { setStatus(nativeEvent.description); void report({ error: nativeEvent.description }); }} /> : <View />}
  </SafeAreaView>;
}
registerRootComponent(Fixture);
