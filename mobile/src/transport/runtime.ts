import init, { Client, generateKeypair } from '../../../host/generated/noise/vibyra_transport.js';
import { decodePreviewBytes } from '../preview/frameCodec';
import { PreviewOutboundQueue } from './PreviewOutboundQueue';

declare const NOISE_WASM_BASE64: string;
const bytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], b => parseInt(b, 16));
const base64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const encode = new TextEncoder();
const decode = new TextDecoder();
const post = (message: unknown) => {
  const text = JSON.stringify(message);
  const native = (window as unknown as { ReactNativeWebView?: { postMessage(s: string): void } }).ReactNativeWebView;
  if (native) native.postMessage(text); else parent.postMessage(text, '*');
};
let socket: WebSocket | undefined;
let client: Client | undefined;
let generation = 0;
let connected = false;
let relayId = '';
let requestRoute = 'direct';
let connectionId: string | undefined;
const previewQueue = new PreviewOutboundQueue();
let previewTimer: ReturnType<typeof setTimeout> | undefined;
// The deployed Cloud relay allows only 120 envelopes per second on a socket.
// Leave room for terminal RPC while a large page is sending Preview credits.
const previewInterval = () => requestRoute === 'relay' ? 12 : 4;
const ready = init({ module_or_path: bytes(NOISE_WASM_BASE64) });

function write(frame: Uint8Array) {
  if (socket?.readyState !== WebSocket.OPEN) throw new Error('Computer is disconnected.');
  if (socket.bufferedAmount > 1024 * 1024) throw new Error('Connection is too slow. Reconnect before sending more input.');
  socket.send(requestRoute === 'relay' ? JSON.stringify({ type: 'frame', clientId: relayId, data: base64(frame) }) : frame);
}
function clearPreviewQueue() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = undefined;
  previewQueue.clear();
}
function flushPreviewQueue() {
  previewTimer = undefined;
  if (!connected || !client || socket?.readyState !== WebSocket.OPEN) { clearPreviewQueue(); return; }
  // Direct LAN sockets can absorb more queued control frames than the Cloud
  // relay. A 32 KiB cap made the tiny WebView depend on throttled retry timers.
  const socketLimit = requestRoute === 'direct' ? 256 * 1024 : 32 * 1024;
  if (previewQueue.length && socket.bufferedAmount < socketLimit) {
    const next = previewQueue.pop()!;
    try { write(client.encrypt(next)); }
    catch { clearPreviewQueue(); post({ type: 'preview-error', connectionId, message: 'Preview is waiting for the connection.' }); return; }
  }
  if (previewQueue.length) previewTimer = setTimeout(flushPreviewQueue, previewInterval());
}
function enqueuePreview(frame: Uint8Array, key: string, urgent: boolean) {
  previewQueue.push(frame, key, urgent);
  // Direct Host sockets do not need relay pacing. Send from the WebView
  // message itself: iOS can throttle timers in this tiny runtime view while
  // a page is loading many assets.
  if (requestRoute === 'direct') {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = undefined;
    flushPreviewQueue();
    return;
  }
  if (!previewTimer) previewTimer = setTimeout(flushPreviewQueue, previewInterval());
}
async function command(event: MessageEvent) {
  const native = (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
  if (!native && event.source !== parent) return;
  if (typeof event.data !== 'string') return;
  let message;
  try { message = JSON.parse(event.data); } catch { return; }
  if (message.target !== 'vibyra-runtime') return;
  try {
    await ready;
    if (message.type === 'keygen') {
      const key = generateKeypair();
      post({ type: 'keypair', key: Array.from(key.subarray(0, 32), b => b.toString(16).padStart(2, '0')).join('') });
      key.fill(0); return;
    }
    if (message.type === 'close') {
      generation++; clearPreviewQueue(); socket?.close(); client?.free(); client = undefined; connected = false; return;
    }
    if (message.type === 'send') {
      if (message.connectionId !== connectionId) return;
      if (!connected || !client) throw new Error('Computer is disconnected.');
      const payload = encode.encode(JSON.stringify(message.payload));
      if (payload.length > 60000) throw new Error('This request is too large.');
      write(client.encrypt(payload)); return;
    }
    if (message.type === 'send-preview') {
      if (message.connectionId !== connectionId) return;
      try {
        if (!connected || !client) throw new Error('Computer is disconnected.');
        if (typeof message.frame !== 'string' || message.frame.length > 24000) throw new Error('Invalid Preview frame.');
        const frame = bytes(message.frame);
        const parsed = decodePreviewBytes(frame);
        const key = `${parsed.key.id}:${parsed.key.generation}`;
        if (parsed.kind === 'cancel') previewQueue.cancelKey(key);
        enqueuePreview(frame, key, parsed.kind === 'cancel' || parsed.kind === 'credit');
      } catch (error) {
        clearPreviewQueue();
        post({ type: 'preview-error', connectionId, message: error instanceof Error ? error.message : 'Preview could not send.' });
      }
      return;
    }
    if (message.type !== 'open') return;
    generation++; const current = generation;
    clearPreviewQueue();
    connectionId = message.connectionId;
    const notify = (notice: object) => post({ ...notice, connectionId: message.connectionId });
    socket?.close(); client?.free(); connected = false;
    const pairing = message.pairing;
    client = new Client(hex(message.privateKey), hex(pairing.publicKey));
    requestRoute = pairing.route ?? 'direct'; relayId = '';
    socket = new WebSocket(pairing.url); socket.binaryType = 'arraybuffer';
    const auth = encode.encode(JSON.stringify({ protocol: 1, deviceName: message.deviceName, invite: pairing.invite }));
    const start = () => { if (client) write(client.start(auth)); };
    socket.onopen = () => {
      if (current !== generation) return;
      notify({ type: 'transport-open' });
      if (requestRoute === 'relay') socket?.send(JSON.stringify({ type: 'client.connect', hostId: pairing.hostId, token: pairing.relayToken, name: message.deviceName }));
      else start();
    };
    socket.onmessage = event => {
      if (current !== generation || !client) return;
      try {
        let data: Uint8Array;
        if (requestRoute === 'relay') {
          const envelope = JSON.parse(event.data);
          if (envelope.type === 'client.ready') { relayId = envelope.clientId; start(); return; }
          // The relay refused before any computer was reached: its reason is
          // the whole story ("That computer is not online…").
          if (envelope.type === 'error') { socket?.close(); notify({ type: 'error', message: String(envelope.message || 'Vibyra Cloud refused the connection.') }); return; }
          if (envelope.type !== 'frame' || envelope.clientId !== relayId) throw new Error('Invalid relay message.');
          data = bytes(envelope.data);
        } else data = new Uint8Array(event.data);
        if (data.length > 65535) throw new Error('Invalid connection frame.');
        if (!connected) {
          // The handshake completed, so this refusal came from the pinned
          // computer itself. Its own words say whether the phone should wait,
          // try again, or be paired afresh; a generic line says none of it.
          const reply = JSON.parse(decode.decode(client.finish(data)));
          if (reply.ok !== true || reply.protocol !== 1) {
            socket?.close();
            notify({ type: 'error', message: reply.error?.message ?? 'Computer refused the connection.' });
            return;
          }
          connected = true; notify({ type: 'connected', deviceId: reply.deviceId });
        } else {
          const plaintext = client.decrypt(data);
          if (plaintext[0] === 0x56 && plaintext[1] === 0x50) {
            decodePreviewBytes(plaintext);
            notify({ type: 'preview-frame', frame: base64(plaintext) });
          } else notify({ type: 'message', payload: JSON.parse(decode.decode(plaintext)) });
        }
        // An inbound frame is another chance to drain a direct connection
        // whose socket buffer was full on the previous send.
        if (requestRoute === 'direct' && previewQueue.length) {
          if (previewTimer) clearTimeout(previewTimer);
          previewTimer = undefined;
          flushPreviewQueue();
        }
      } catch { socket?.close(); notify({ type: 'error', message: 'The encrypted connection could not be verified. Pair again on your computer.' }); }
    };
    socket.onerror = () => { if (current === generation) notify({ type: 'error', message: 'Cannot reach your computer. Check that Vibyra Host is running.' }); };
    socket.onclose = () => {
      if (current !== generation) return;
      connected = false; client?.free(); client = undefined;
      clearPreviewQueue();
      notify({ type: 'closed' });
    };
  } catch (error) { post({ type: 'error', message: error instanceof Error ? error.message : 'Connection failed.' }); }
}
window.addEventListener('message', command);
document.addEventListener('message', command as unknown as EventListener);
ready.then(() => post({ type: 'ready' })).catch(() => post({ type: 'error', message: 'Secure connection support could not start.' }));
