import { RpcClient } from '../transport/RpcClient';
import { PreviewReceiveCredit, PreviewSendCredit } from './credit';
import { decodePreviewFrame, encodePreviewFrame, PREVIEW_CHUNK, PREVIEW_WINDOW, type PreviewFrame } from './frameCodec';
import type { NativePreviewProxy, PreviewRequest as Request } from './controllerTypes';
import { previewStartUrl } from './openingPath';
export type { NativePreviewProxy } from './controllerTypes';

const MAX_REQUEST_BODY = 1024 * 1024;
const text = new TextEncoder();
const decode = new TextDecoder('utf-8', { fatal: true });
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** Bounded browser adapter over one encrypted, authenticated Mac connection. */
export class HttpProxyController {
  private requests = new Map<string, Request>();
  private listeners: { remove(): void }[] = [];
  private unlisten: (() => void) | null = null;
  private closed = false;
  private browserOrigin = '';

  constructor(private rpc: RpcClient, private native: NativePreviewProxy, private generation: string) {}

  async start(startPath = '/'): Promise<string> {
    this.listeners.push(this.native.addListener('onPreviewRequest', event => this.openRequest(event)));
    this.listeners.push(this.native.addListener('onPreviewBody', event => this.requestBody(event)));
    this.listeners.push(this.native.addListener('onPreviewEnd', event => this.requestEnd(event)));
    this.listeners.push(this.native.addListener('onPreviewCancel', event => this.cancel(event.id)));
    this.unlisten = this.rpc.listen(notice => {
      if (notice.type === 'preview-frame' && typeof notice.frame === 'string') this.receive(notice.frame);
      if (notice.type === 'preview-error' || notice.type === 'closed' || notice.type === 'error') this.failAll();
    });
    try {
      const url = await this.native.startProxy(this.generation);
      this.browserOrigin = new URL(url).origin;
      return previewStartUrl(url, startPath);
    }
    catch (error) { await this.close(); throw error; }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.listeners.forEach(listener => listener.remove());
    this.unlisten?.();
    for (const id of this.requests.keys()) this.cancel(id);
    await this.native.stopProxy();
  }

  private transmit(frame: PreviewFrame): void { this.rpc.sendPreviewFrame(encodePreviewFrame(frame)); }

  private openRequest(event: any): void {
    if (this.closed || event.generation !== this.generation || typeof event.id !== 'string') return;
    // Native admits eight sockets. Allow completed sockets still crossing the
    // JS bridge to overlap with their successors without rejecting an asset.
    if (this.requests.size >= 16 || this.requests.has(event.id)) { void this.native.responseCancel(event.id); return; }
    try {
      const kind = event.kind === 'upgrade' ? 'upgrade' : 'http';
      const key = { id: event.id, generation: this.generation };
      const metadata = text.encode(JSON.stringify({ v: 1, kind, method: event.method,
        path: event.path, headers: event.headers, browserOrigin: this.browserOrigin }));
      if (metadata.length < 1 || metadata.length > PREVIEW_CHUNK) throw new Error('Preview request headers are too large.');
      const request: Request = { key, kind, send: new PreviewSendCredit(), metadataBytes: metadata.length,
        nativeReadIssued: 0n,
        queued: [{ kind: 'data', key, sequence: 0, bytes: metadata }], queuedBytes: metadata.length,
        bodyBytes: 0, nextBody: 1, end: null, inputEnded: false,
        response: null, responseStarted: false, processing: Promise.resolve() };
      this.requests.set(event.id, request);
      this.transmit({ kind: 'open', key });
    } catch { this.fail(event.id); }
  }

  private requestBody(event: any): void {
    const request = this.requests.get(event.id);
    if (!request) return;
    try {
      const bytes = Uint8Array.from(atob(event.dataBase64), char => char.charCodeAt(0));
      if (request.inputEnded || event.seq !== request.nextBody || bytes.length < 1
        || bytes.length > PREVIEW_CHUNK || (request.kind === 'http' && request.bodyBytes + bytes.length > MAX_REQUEST_BODY)
        || request.queuedBytes + bytes.length > (request.kind === 'http'
          ? MAX_REQUEST_BODY + PREVIEW_CHUNK : PREVIEW_WINDOW)) {
        throw new Error('Invalid Preview body.');
      }
      request.queued.push({ kind: 'data', key: request.key, sequence: event.seq, bytes });
      request.nextBody++;
      request.bodyBytes += bytes.length;
      request.queuedBytes += bytes.length;
      this.flush(request);
    } catch { this.fail(event.id); }
  }

  private requestEnd(event: any): void {
    const request = this.requests.get(event.id);
    if (!request) return;
    if (event.seq !== request.nextBody || request.inputEnded) { this.fail(event.id); return; }
    request.inputEnded = true;
    request.end = event.seq;
    this.flush(request);
  }

  private flush(request: Request): void {
    try {
      while (request.queued.length && request.send.take(request.queued[0].bytes.length)) {
        const frame = request.queued.shift()!;
        request.queuedBytes -= frame.bytes.length;
        this.transmit(frame);
      }
      if (request.end !== null && !request.queued.length) {
        this.transmit({ kind: 'end', key: request.key, sequence: request.end });
        request.end = null;
      }
      // The native socket reader sees only credit left after seq0 metadata.
      // Grant each cumulative byte once, so a fast WebSocket cannot queue
      // unbounded JS/base64 events ahead of the Mac's actual consumption.
      if (request.kind === 'upgrade' && !request.queued.length) {
        const available = request.send.totalGranted - BigInt(request.metadataBytes);
        const delta = available - request.nativeReadIssued;
        if (delta > 0n) {
          if (delta > BigInt(PREVIEW_WINDOW)) throw new Error('Invalid Preview read credit.');
          request.nativeReadIssued += delta;
          void this.native.allowRequestRead(request.key.id, Number(delta)).catch(() => this.fail(request.key.id));
        }
      }
    } catch { this.fail(request.key.id); }
  }

  private receive(encoded: string): void {
    let frame: PreviewFrame;
    try { frame = decodePreviewFrame(encoded); } catch { this.failAll(); return; }
    if (frame.key.generation !== this.generation) return;
    const request = this.requests.get(frame.key.id);
    if (!request) {
      if (frame.kind !== 'cancel') { try { this.transmit({ kind: 'cancel', key: frame.key }); } catch { /* offline */ } }
      return;
    }
    if (frame.kind === 'cancel') { this.fail(frame.key.id, false); return; }
    if (frame.kind === 'credit') {
      try { request.send.grant(frame.total); this.flush(request); } catch { this.fail(frame.key.id); }
      return;
    }
    if (frame.kind === 'open') {
      if (request.response) { this.fail(frame.key.id); return; }
      request.response = new PreviewReceiveCredit();
      try { this.transmit({ kind: 'credit', key: frame.key, total: request.response.initialTotal }); }
      catch { this.fail(frame.key.id); }
      return;
    }
    request.processing = request.processing.then(() => this.consume(request, frame)).catch(() => this.fail(frame.key.id));
  }

  private async consume(request: Request, frame: PreviewFrame): Promise<void> {
    const window = request.response;
    if (!window) throw new Error('Preview response not open.');
    if (frame.kind === 'data') {
      window.accept(frame.sequence, frame.bytes.length);
      if (frame.sequence === 0) {
        const metadata = JSON.parse(decode.decode(frame.bytes));
        if (metadata.v !== 1 || !Number.isInteger(metadata.status)
          || metadata.status < 100 || metadata.status > 599 || !metadata.headers
          || typeof metadata.headers !== 'object') throw new Error('Invalid Preview response.');
        if (metadata.status === 101 && request.kind !== 'upgrade') {
          throw new Error('Unexpected Preview protocol upgrade.');
        }
        const setCookies = metadata.setCookies ?? [];
        if (!Array.isArray(setCookies) || setCookies.length > 16
          || setCookies.some(cookie => typeof cookie !== 'string' || cookie.length > 4096)) {
          throw new Error('Invalid Preview cookies.');
        }
        await this.native.responseStart(request.key.id, metadata.status, metadata.headers, setCookies);
        request.responseStarted = true;
      } else {
        if (!request.responseStarted) throw new Error('Preview body before status.');
        await this.native.responseData(request.key.id, base64(frame.bytes));
      }
      this.transmit({ kind: 'credit', key: request.key, total: window.acknowledge(frame.bytes.length) });
    } else if (frame.kind === 'end') {
      window.end(frame.sequence);
      if (!request.responseStarted) throw new Error('Preview response has no status.');
      await this.native.responseEnd(request.key.id);
      this.requests.delete(request.key.id);
    }
  }

  private cancel(id: string): void {
    const request = this.requests.get(id);
    if (!request) return;
    this.requests.delete(id);
    try { this.transmit({ kind: 'cancel', key: request.key }); } catch { /* already offline */ }
    void this.native.responseCancel(id);
  }

  private fail(id: string, tellMac = true): void {
    const request = this.requests.get(id);
    if (!request) { void this.native.responseCancel(id); return; }
    this.requests.delete(id);
    if (tellMac) { try { this.transmit({ kind: 'cancel', key: request.key }); } catch { /* offline */ } }
    void this.native.responseCancel(id);
  }

  private failAll(): void { for (const id of this.requests.keys()) this.fail(id); }
}
