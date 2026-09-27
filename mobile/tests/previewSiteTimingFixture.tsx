// Isolated native timing proof for a real running site (such as HKE) over the
// product Preview transport: RuntimeBridge → RpcClient → HttpProxyController →
// loopback → WKWebView. Run by scripts/verify-preview-loopback-native.mjs with
// VIBYRA_PREVIEW_CASE=site against desktop's `live_site_fixture`. Never the
// user's own Simulator.
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

// Samples the page until the site's own JavaScript has drawn it (or 60 s pass).
const probe = `
(() => {
  const started = Date.now();
  const tick = () => {
    // The app's own root, not body text: PHP warnings printed before the page
    // are hundreds of characters and would pass for a drawn site.
    const root = document.querySelector('#app, [data-page], #root') || document.body;
    const text = (root && root.innerText || '').trim().length;
    const sample = { t: Date.now() - started, ready: document.readyState, text,
      root: root ? root.innerHTML.length : 0,
      resources: performance.getEntriesByType('resource').length,
      // Loads that skipped the Preview for the Mac's own port: they work on a
      // Simulator, which shares the Mac's loopback, and fail on a real phone.
      bypassed: performance.getEntriesByType('resource').map(entry => new URL(entry.name))
        .filter(url => url.host !== location.host && /^(127\\.|localhost$|\\[::1\\]$)/.test(url.hostname))
        .map(url => url.host + url.pathname).slice(0, 5) };
    window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'sample', sample }));
    if (text > 200 && document.readyState === 'complete') {
      window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'drawn', sample }));
      if (Date.now() - started < 60000) setTimeout(tick, 1000);
    } else if (Date.now() - started < 60000) setTimeout(tick, 250);
    else window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'timeout', sample }));
  };
  window.addEventListener('error', event => window.ReactNativeWebView.postMessage(
    JSON.stringify({ kind: 'script-error', message: String(event.message) })));
  tick();
})();
true;`;

function SiteTimingFixture() {
  const bridge = useRef<BridgeHandle>(null);
  const rpc = useRef(new RpcClient(message => bridge.current?.post(message), randomUUID)).current;
  const controller = useRef<HttpProxyController | null>(null);
  const origin = useRef(0);
  const at = () => Date.now() - origin.current;
  const timeline = useRef<Record<string, number>>({});
  const requests = useRef<Record<string, { path: string; start: number; macOpen?: number; firstData?: number; end?: number; bytes: number; canceled?: boolean }>>({});
  const samples = useRef<unknown[]>([]);
  const errors = useRef<string[]>([]);
  const sent = useRef(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finish = (outcome: string, extra: object = {}) => {
    if (sent.current) return;
    sent.current = true;
    const list = Object.values(requests.current).sort((a, b) => a.start - b.start);
    void report({ outcome, timeline: timeline.current, errors: errors.current,
      requests: list.length, slowest: [...list].filter(r => r.end).sort((a, b) => (b.end! - b.start) - (a.end! - a.start)).slice(0, 8),
      unfinished: list.filter(r => !r.end && !r.canceled).map(r => ({ path: r.path, start: r.start, bytes: r.bytes })).slice(0, 12),
      canceled: list.filter(r => r.canceled).map(r => r.path).slice(0, 12),
      bytes: list.reduce((sum, r) => sum + r.bytes, 0), samples: samples.current.slice(-6), ...extra });
  };
  useEffect(() => {
    void (async () => {
      if (!native) throw new Error('Native Preview module is missing.');
      let config: { pairUri?: string; ready?: boolean } = {};
      for (let attempt = 0; attempt < 120 && !config.pairUri; attempt++) {
        config = await fetch(`${endpoint}/config`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        if (!config.pairUri) await new Promise(resolve => setTimeout(resolve, 500));
      }
      const key = await rpc.createKeypair();
      await rpc.open(parsePairing(config.pairUri!), key);
      // The same window negotiation as the app: the Mac says how far ahead it takes credit.
      const state = await rpc.request<{ capabilities?: { previewWindowBytes?: number } }>('host.state');
      const window = Math.min(Math.max(state.capabilities?.previewWindowBytes ?? 65536, 65536), 1048576);
      timeline.current.window = window;
      origin.current = Date.now();
      let targets: { targets: { grantId: string; targetId: string; running?: boolean }[] } = { targets: [] };
      for (let attempt = 0; attempt < 40 && !targets.targets.length; attempt++) {
        targets = await rpc.request('preview.list');
        if (!targets.targets.length) await new Promise(resolve => setTimeout(resolve, 500));
      }
      timeline.current.listed = at();
      const target = targets.targets[0];
      if (!target) throw new Error('The Mac listed no running site.');
      const opened = await rpc.request<{ generation: string; startPath?: string }>('preview.open', { grantId: target.grantId });
      timeline.current.opened = at();
      rpc.listen(notice => {
        if (notice.type !== 'preview-frame' || typeof notice.frame !== 'string') return;
        try {
          const frame = decodePreviewFrame(notice.frame);
          const entry = requests.current[frame.key.id];
          if (!entry) return;
          if (frame.kind === 'open') { entry.macOpen ??= at(); (entry as any).macOpenWall ??= Date.now(); }
          if (frame.kind === 'data' && frame.sequence > 0) entry.firstData ??= at();
          if (frame.kind === 'data') entry.bytes += frame.bytes.length;
          if (frame.kind === 'end') entry.end = at();
          if (frame.kind === 'cancel') entry.canceled = true;
        } catch { errors.current.push('invalid frame'); }
      });
      native.addListener('onPreviewRequest', event => {
        requests.current[event.id] = { id: event.id, path: event.path, start: at(), wall: Date.now(), bytes: 0 } as never;
        timeline.current.firstRequest ??= at();
      });
      native.addListener('onPreviewCancel', event => {
        const entry = requests.current[event.id];
        if (entry) entry.canceled = true;
      });
      controller.current = new HttpProxyController(rpc, native, opened.generation, window);
      const start = await controller.current.start(opened.startPath ?? '/');
      timeline.current.bootstrap = at();
      setUrl(start);
    })().catch(cause => setError(String(cause)));
    return () => { void controller.current?.close(); rpc.close(); };
  }, [rpc]);
  useEffect(() => { if (error) finish('error', { error }); }, [error]);
  return <View style={{ flex: 1 }}>
    <RuntimeBridge ref={bridge} onMessage={rpc.receive} />
    {url ? <WebView source={{ uri: url }} incognito javaScriptEnabled domStorageEnabled
      sharedCookiesEnabled={false} originWhitelist={['http://127.0.0.1:*']}
      injectedJavaScript={probe}
      onLoadStart={() => { timeline.current.loadStart ??= at(); timeline.current.loads = (timeline.current.loads ?? 0) + 1; }}
      onLoadEnd={() => { timeline.current.loadEnd ??= at(); }}
      onHttpError={event => errors.current.push(`HTTP ${event.nativeEvent.statusCode} ${event.nativeEvent.url}`)}
      onError={event => errors.current.push(event.nativeEvent.description)}
      onMessage={event => {
        try {
          const update = JSON.parse(event.nativeEvent.data);
          if (update.kind === 'sample') samples.current.push({ ...update.sample, at: at() });
          else if (update.kind === 'script-error') errors.current.push(`script: ${update.message}`);
          else if (update.kind === 'drawn' && timeline.current.drawn === undefined) {
            // Keep watching: a page that reloads itself or goes white again is not drawn.
            timeline.current.drawn = at();
            setTimeout(() => finish('drawn', { final: samples.current[samples.current.length - 1] ?? update.sample }), 15000);
          }
          else if (update.kind === 'timeout') finish('timeout', { final: update.sample });
        } catch (cause) { setError(String(cause)); }
      }} />
      : <Text>{error ?? 'Connecting to the Mac site fixture…'}</Text>}
  </View>;
}

registerRootComponent(SiteTimingFixture);
