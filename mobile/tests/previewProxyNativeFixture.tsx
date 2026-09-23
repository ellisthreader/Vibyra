import { useEffect, useRef, useState } from 'react';
import { registerRootComponent } from 'expo';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { RpcClient } from '../src/transport/RpcClient';
import { HttpProxyController, type NativePreviewProxy } from '../src/preview/HttpProxyController';
import { PreviewFakeMac } from './previewFakeMac';

const native = requireOptionalNativeModule<NativePreviewProxy>('VibyraPreviewProof');
const report = (result: object) => fetch('http://127.0.0.1:8094/result', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(result),
});

const script = `
(async () => {
  const stage = sessionStorage.getItem('stage') || 'checks';
  if (location.pathname === '/' && stage === 'checks') {
    const result = { secure: window.isSecureContext, cookie: false, post: false, sse: false,
      websocket: false, wsReason: '', assetBytes: 0 };
    try {
      await fetch('/cookie');
      result.cookie = (await (await fetch('/api')).json()).cookie === true;
      result.post = (await (await fetch('/form', { method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'value=saved' })).text()).includes('value=saved');
      result.assetBytes = (await (await fetch('/asset')).arrayBuffer()).byteLength;
      result.sse = await new Promise(resolve => {
        const source = new EventSource('/events');
        const timer = setTimeout(() => { source.close(); resolve(false); }, 5000);
        source.onmessage = event => { clearTimeout(timer); source.close(); resolve(event.data === 'live-event'); };
      });
      result.websocket = await new Promise(resolve => {
        const socket = new WebSocket('ws://' + location.host + '/ws');
        const timer = setTimeout(() => { result.wsReason = 'timeout'; socket.close(); resolve(false); }, 5000);
        socket.onopen = () => socket.send('echo-me');
        socket.onmessage = event => { clearTimeout(timer); socket.close();
          result.wsReason = String(event.data); resolve(event.data === 'echo:echo-me'); };
        socket.onerror = () => { clearTimeout(timer); result.wsReason = 'socket error'; resolve(false); };
      });
    } catch (error) { result.error = String(error); }
    window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'checks', result }));
    sessionStorage.setItem('stage', 'form');
    document.getElementById('post-form').submit();
  } else if (location.pathname === '/form') {
    window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'form', ok: document.body.textContent.includes('value=saved') }));
    sessionStorage.setItem('stage', 'next'); location.href = '/';
  } else if (location.pathname === '/' && stage === 'next') document.getElementById('next-link').click();
  else if (location.pathname === '/next')
    window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'navigation', ok: !!document.getElementById('next') }));
})().catch(error => window.ReactNativeWebView.postMessage(JSON.stringify({kind:'error',error:String(error)})));
true;`;

function PreviewProxyFixture() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const results = useRef<Record<string, unknown>>({});
  const fakeMac = useRef<PreviewFakeMac | null>(null);
  useEffect(() => {
    if (!native) { setError('Native Preview module is missing.'); return; }
    fakeMac.current = new PreviewFakeMac();
    const controller = new HttpProxyController(fakeMac.current as unknown as RpcClient, native, '1');
    void controller.start().then(async value => {
      const origin = new URL(value).origin;
      results.current.isolation = (await fetch(origin)).status === 403;
      setUrl(value);
    }).catch(cause => setError(String(cause)));
    return () => { void controller.close(); };
  }, []);
  useEffect(() => { if (error) void report({ error }); }, [error]);
  if (!url) return <View><Text>{error ?? 'Starting private loopback proxy…'}</Text></View>;
  const origin = new URL(url).origin;
  return <WebView source={{ uri: url }} incognito sharedCookiesEnabled={false}
    originWhitelist={['*']}
    onShouldStartLoadWithRequest={request => request.url.startsWith(`${origin}/`)}
    injectedJavaScript={script}
    onMessage={event => {
      try {
        const update = JSON.parse(event.nativeEvent.data);
        if (update.kind === 'checks') results.current.checks = update.result;
        else if (update.kind === 'form') results.current.form = update.ok;
        else if (update.kind === 'navigation') { results.current.navigation = update.ok;
          results.current.fakeMac = fakeMac.current?.debug; void report(results.current); }
        else if (update.kind === 'error') setError(update.error);
      } catch (cause) { setError(String(cause)); }
    }} onError={event => setError(event.nativeEvent.description)} />;
}

registerRootComponent(PreviewProxyFixture);
