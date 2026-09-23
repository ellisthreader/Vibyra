import { useEffect, useRef, useState } from 'react';
import { registerRootComponent } from 'expo';
import { randomUUID } from 'expo-crypto';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { HttpProxyController, type NativePreviewProxy } from '../src/preview/HttpProxyController';
import { decodePreviewFrame } from '../src/preview/frameCodec';
import { RuntimeBridge } from '../src/transport/RuntimeBridge';
import type { BridgeHandle } from '../src/transport/Bridge.types';
import { parsePairing } from '../src/transport/pairing';
import { RpcClient } from '../src/transport/RpcClient';

const endpoint = 'http://127.0.0.1:8094';
const native = requireOptionalNativeModule<NativePreviewProxy>('VibyraPreviewProof');
const report = (result: object) => fetch(`${endpoint}/result`, { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify(result) });

const checks = `
(async () => {
  const stage = sessionStorage.getItem('stage') || 'checks';
  if (location.pathname === '/' && stage === 'checks') {
    const result = { secure: isSecureContext, cookie: false, post: false, sse: false,
      websocket: false, wsReason: '', assetBytes: 0, state: false };
    try {
      const state = await (await fetch('/api/state')).json();
      result.cookie = state.cookie.includes('preview_csrf=fixture-token');
      result.state = state.value === 'initial';
      result.sse = await new Promise(resolve => {
        const source = new EventSource('/events');
        const timer = setTimeout(() => { source.close(); resolve(false); }, 15000);
        source.onmessage = event => { clearTimeout(timer); source.close(); resolve(event.data === 'connected'); };
      });
      result.websocket = await new Promise(resolve => {
        const socket = new WebSocket('ws://' + location.host + '/ws');
        const timer = setTimeout(() => { result.wsReason = 'timeout'; socket.close(); resolve(false); }, 15000);
        socket.onopen = () => socket.send('hello');
        socket.onmessage = event => { clearTimeout(timer); socket.close();
          result.wsReason = String(event.data); resolve(event.data === 'echo:hello'); };
        socket.onerror = () => { clearTimeout(timer); result.wsReason = 'socket error'; resolve(false); };
      });
      window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'asset-start' }));
      try { result.assetBytes = (await (await fetch('/assets/large')).arrayBuffer()).byteLength; }
      finally { window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'asset-end' })); }
    } catch (error) { result.error = String(error); }
    window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'checks', result }));
    sessionStorage.setItem('stage', 'form');
    document.querySelector('form').submit();
  } else if (location.pathname === '/page' && stage === 'form') {
    const state = await (await fetch('/api/state')).json();
    window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'form',
      ok: document.querySelector('#saved')?.textContent === 'changed' &&
        state.value === 'changed' && state.cookie.includes('preview_session=fixture') &&
        state.cookie.includes('preview_preference=mobile') }));
    sessionStorage.setItem('stage', 'link');
    document.querySelector('a[href="/"]').click();
  } else if (location.pathname === '/' && stage === 'link') {
    sessionStorage.setItem('stage', 'done');
    document.querySelector('a[href="/page"]').click();
  } else if (location.pathname === '/page' && stage === 'done')
    window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'navigation',
      ok: document.querySelector('#saved')?.textContent === 'changed' }));
})().catch(error => window.ReactNativeWebView.postMessage(JSON.stringify({
  kind: 'error', error: String(error) })));
true;`;

function NoisePreviewFixture() {
  const bridge = useRef<BridgeHandle>(null);
  const rpc = useRef(new RpcClient(message => bridge.current?.post(message), randomUUID)).current;
  const controller = useRef<HttpProxyController | null>(null);
  const results = useRef<Record<string, unknown>>({});
  const debug = useRef({ paths: {} as Record<string, string>, received: {} as Record<string, number>,
    canceled: [] as string[], notices: [] as string[] });
  const assetStarted = useRef(false);
  const assetEnded = useRef(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!native) throw new Error('Native Preview module is missing.');
      const config = await fetch(`${endpoint}/config`).then(response => response.json());
      const pairing = parsePairing(config.pairUri);
      const key = await rpc.createKeypair();
      await rpc.open(pairing, key);
      let targets: { targets: { grantId: string }[] } = { targets: [] };
      for (let attempt = 0; attempt < 20; attempt++) {
        targets = await rpc.request('preview.list');
        if (targets.targets.length) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      const grantId = targets.targets[0]?.grantId;
      if (!grantId) throw new Error('Mac granted no Preview target.');
      results.current.grant = true;
      const started = await rpc.request<{ phase: string }>('preview.start', { grantId }, 90000);
      results.current.started = started.phase;
      const opened = await rpc.request<{ generation: string }>('preview.open', { grantId });
      controller.current = new HttpProxyController(rpc, native, opened.generation);
      const requestListener = native.addListener('onPreviewRequest', event => {
        debug.current.paths[event.id] = event.path;
      });
      const cancelListener = native.addListener('onPreviewCancel', event => {
        debug.current.canceled.push(debug.current.paths[event.id] ?? event.id);
      });
      const noticeListener = rpc.listen(notice => {
        if (notice.type === 'preview-frame' && typeof notice.frame === 'string') {
          try {
            const frame = decodePreviewFrame(notice.frame);
            if (frame.kind === 'data' && frame.sequence > 0) {
              debug.current.received[frame.key.id] = (debug.current.received[frame.key.id] ?? 0) + frame.bytes.length;
            }
            if (frame.kind === 'cancel') debug.current.canceled.push(`Mac:${debug.current.paths[frame.key.id] ?? frame.key.id}`);
          } catch { debug.current.notices.push('invalid frame'); }
        } else if (notice.type === 'preview-error' || notice.type === 'error' || notice.type === 'closed') {
          debug.current.notices.push(`${notice.type}:${notice.message ?? ''}`);
        }
      });
      const bootstrap = await controller.current.start();
      const origin = new URL(bootstrap).origin;
      results.current.isolation = (await fetch(origin)).status === 403;
      if (active) setUrl(bootstrap);
      else { requestListener.remove(); cancelListener.remove(); noticeListener(); }
    })().catch(cause => setError(String(cause)));
    return () => { active = false; void controller.current?.close(); rpc.close(); };
  }, [rpc]);
  useEffect(() => { if (error) void report({ error, ...results.current, debug: debug.current }); }, [error]);
  const origin = url ? new URL(url).origin : '';
  return <View style={{ flex: 1 }}>
    <RuntimeBridge ref={bridge} onMessage={rpc.receive} />
    {url ? <WebView source={{ uri: url }} incognito sharedCookiesEnabled={false}
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={request => request.url.startsWith(`${origin}/`)}
      injectedJavaScript={checks}
      onMessage={event => {
        try {
          const update = JSON.parse(event.nativeEvent.data);
          if (update.kind === 'asset-start' && !assetStarted.current) {
            assetStarted.current = true;
            void (async () => {
              const latencies: number[] = [];
              let during = 0;
              let sessionCount = -1;
              for (let index = 0; index < 10; index++) {
                const started = Date.now();
                const response = await rpc.request<{ sessions: unknown[] }>('session.list');
                latencies.push(Date.now() - started);
                sessionCount = response.sessions.length;
                if (!assetEnded.current) during++;
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              results.current.rpcDuringAsset = { count: latencies.length, during,
                maxMs: Math.max(...latencies), sessionCount };
            })().catch(cause => { results.current.rpcDuringAsset = { error: String(cause) }; });
          } else if (update.kind === 'asset-end') assetEnded.current = true;
          else if (update.kind === 'checks') results.current.checks = update.result;
          else if (update.kind === 'form') results.current.form = update.ok;
          else if (update.kind === 'navigation') {
            results.current.navigation = update.ok;
            void report({ ...results.current, debug: debug.current });
          } else if (update.kind === 'error') setError(update.error);
        } catch (cause) { setError(String(cause)); }
      }} onError={event => setError(event.nativeEvent.description)} />
      : <Text>{error ?? 'Connecting to the encrypted Mac Preview fixture…'}</Text>}
  </View>;
}

registerRootComponent(NoisePreviewFixture);
