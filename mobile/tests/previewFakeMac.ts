import { PreviewReceiveCredit, PreviewSendCredit } from '../src/preview/credit';
import { decodePreviewFrame, encodePreviewFrame, type PreviewFrame, type PreviewKey } from '../src/preview/frameCodec';
import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync } from 'expo-crypto';

const page = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<h1 id="root">Native proxy proof</h1><a id="next-link" href="/next">Next</a>
<form id="post-form" action="/form" method="post"><input name="value" value="saved"><button>Submit</button></form>`;
const text = new TextEncoder();
const decode = new TextDecoder();
interface Request { key: PreviewKey; receive: PreviewReceiveCredit; meta?: { kind: string; method: string; path: string; headers: Record<string, string> };
  body: Uint8Array[]; response?: Response }
interface Response { send: PreviewSendCredit; next: number; chunks: Uint8Array[]; large: number;
  upgrade: boolean; closing: boolean; ended: boolean }

/** Fixture Mac wire peer: uses the product VP codec/credit state, but no Noise. */
export class PreviewFakeMac {
  readonly debug = { upgrades: 0, handshakes: 0, rawFrames: 0, echoes: 0, cancels: 0, error: '' };
  private listeners = new Set<(notice: any) => void>();
  private requests = new Map<string, Request>();
  listen(callback: (notice: any) => void): () => void {
    this.listeners.add(callback); return () => this.listeners.delete(callback);
  }
  sendPreviewFrame(encoded: string): void {
    const frame = decodePreviewFrame(encoded);
    const id = frame.key.id;
    if (frame.kind === 'open') {
      const request: Request = { key: frame.key, receive: new PreviewReceiveCredit(), body: [] };
      this.requests.set(id, request);
      this.emit({ kind: 'credit', key: frame.key, total: request.receive.initialTotal });
      return;
    }
    const request = this.requests.get(id);
    if (!request) return;
    if (frame.kind === 'data') {
      request.receive.accept(frame.sequence, frame.bytes.length);
      if (frame.sequence === 0) {
        request.meta = JSON.parse(decode.decode(frame.bytes));
        if (request.meta?.kind === 'upgrade') {
          this.debug.upgrades++;
          void this.startUpgrade(request).catch(error => { this.debug.error = String(error); });
        }
      } else {
        request.body.push(frame.bytes);
        if (request.meta?.kind === 'upgrade') { this.debug.rawFrames++; this.echoWebSocket(request); }
      }
      this.emit({ kind: 'credit', key: frame.key, total: request.receive.acknowledge(frame.bytes.length) });
    } else if (frame.kind === 'end') {
      request.receive.end(frame.sequence);
      if (request.meta?.kind !== 'upgrade') this.startResponse(request);
    } else if (frame.kind === 'credit') {
      request.response?.send.grant(frame.total);
      this.flush(request);
    } else if (frame.kind === 'cancel') { this.debug.cancels++; this.requests.delete(id); }
  }

  private startResponse(request: Request): void {
    const method = request.meta?.method;
    const path = request.meta?.path;
    const cookie = request.meta?.headers.cookie ?? '';
    const body = decode.decode(concat(request.body));
    const isAsset = path === '/asset';
    const content = path === '/' ? page : path === '/next' ? '<h1 id="next">Second page</h1>'
      : path === '/form' && method === 'POST' ? `<h1 id="form">${body}</h1>`
      : path === '/api' ? JSON.stringify({ cookie: cookie.includes('proof=works')
        && cookie.includes('second=also-works') && !cookie.includes('_vibyra_preview=') })
      : path === '/events' ? 'data: live-event\n\n' : path === '/cookie' ? 'cookie set' : 'Not found';
    const headers = { 'content-type': isAsset ? 'application/octet-stream' : path === '/events' ? 'text/event-stream'
      : path === '/api' ? 'application/json' : 'text/html; charset=utf-8' };
    const setCookies = path === '/cookie' ? ['proof=works; Path=/; SameSite=Lax',
      'second=also-works; Path=/; SameSite=Lax'] : [];
    request.response = { send: new PreviewSendCredit(), next: 0, large: isAsset ? 640 : 0,
      upgrade: false, closing: false,
      chunks: [text.encode(JSON.stringify({ v: 1, status: 200, headers, setCookies })),
        ...isAsset ? [] : [text.encode(content)]], ended: false };
    this.emit({ kind: 'open', key: request.key });
  }

  private async startUpgrade(request: Request): Promise<void> {
    const key = request.meta?.headers['sec-websocket-key'] ?? '';
    const accept = await digestStringAsync(CryptoDigestAlgorithm.SHA1,
      `${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, { encoding: CryptoEncoding.BASE64 });
    request.response = { send: new PreviewSendCredit(), next: 0, large: 0, upgrade: true,
      closing: false, ended: false,
      chunks: [text.encode(JSON.stringify({ v: 1, status: 101, headers: {
        upgrade: 'websocket', connection: 'Upgrade', 'sec-websocket-accept': accept }, setCookies: [] }))] };
    this.emit({ kind: 'open', key: request.key });
    this.debug.handshakes++;
  }

  private echoWebSocket(request: Request): void {
    const bytes = concat(request.body);
    if (bytes.length < 6) return;
    const opcode = bytes[0] & 15;
    let length = bytes[1] & 127;
    let offset = 2;
    if (length === 126) {
      if (bytes.length < 8) return;
      length = bytes[2] * 256 + bytes[3]; offset = 4;
    }
    if (!(bytes[1] & 128) || bytes.length < offset + 4 + length) return;
    const mask = bytes.slice(offset, offset + 4);
    const payload = bytes.slice(offset + 4, offset + 4 + length).map((value, index) => value ^ mask[index % 4]);
    request.body = [bytes.slice(offset + 4 + length)];
    const response = request.response;
    if (!response) return;
    if (opcode === 1) {
      this.debug.echoes++;
      const echo = text.encode(`echo:${decode.decode(payload)}`);
      response.chunks.push(Uint8Array.from([0x81, echo.length, ...echo]));
    } else if (opcode === 8) {
      response.chunks.push(Uint8Array.from([0x88, 0]));
      response.closing = true;
    }
    this.flush(request);
  }

  private flush(request: Request): void {
    const response = request.response;
    if (!response || response.ended) return;
    const assetChunk = new Uint8Array(16 * 1024).fill(0x5A);
    while (true) {
      const next = response.chunks[0] ?? (response.large > 0 ? assetChunk : null);
      if (!next || !response.send.take(next.length)) break;
      if (response.chunks.length) response.chunks.shift(); else response.large--;
      this.emit({ kind: 'data', key: request.key, sequence: response.next++, bytes: next });
    }
    if (!response.chunks.length && response.large === 0 && (!response.upgrade || response.closing)) {
      response.ended = true;
      this.emit({ kind: 'end', key: request.key, sequence: response.next });
      this.requests.delete(request.key.id);
    }
  }

  private emit(frame: PreviewFrame): void {
    const encoded = encodePreviewFrame(frame);
    queueMicrotask(() => { for (const listener of this.listeners) listener({ type: 'preview-frame', frame: encoded }); });
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
