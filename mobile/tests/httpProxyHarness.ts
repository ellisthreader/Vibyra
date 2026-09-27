import assert from 'node:assert/strict';
import { RpcClient } from '../src/transport/RpcClient';
import type { NativePreviewProxy } from '../src/preview/controllerTypes';
import { decodePreviewFrame, encodePreviewFrame, type PreviewFrame } from '../src/preview/frameCodec';

const pause = () => new Promise(resolve => setTimeout(resolve, 0));

export class FakeNative implements NativePreviewProxy {
  private listeners = new Map<string, (event: any) => void>();
  calls: string[] = [];
  holdData: Promise<void> = Promise.resolve();
  addListener(name: any, callback: (event: any) => void) {
    this.listeners.set(name, callback);
    return { remove: () => { this.listeners.delete(name); } };
  }
  emit(name: string, event: any) { this.listeners.get(name)?.(event); }
  async startProxy(generation: string) { assert.equal(generation, '7'); return 'http://127.0.0.1:40000/_vibyra_preview/token'; }
  async stopProxy() { this.calls.push('stop'); }
  async responseStart(id: string, status: number, _headers: Record<string, string>, setCookies: string[]) {
    this.calls.push(`start:${id}:${status}:${setCookies.length}`);
  }
  async responseData(id: string, dataBase64: string) {
    this.calls.push(`data:${id}:${atob(dataBase64)}`);
    await this.holdData;
  }
  async responseEnd(id: string) { this.calls.push(`end:${id}`); }
  async responseCancel(id: string) { this.calls.push(`cancel:${id}`); }
  async allowRequestRead(id: string, bytes: number) { this.calls.push(`read:${id}:${bytes}`); }
}

export async function connected() {
  const sent: any[] = [];
  let next = 0;
  const client = new RpcClient(message => sent.push(message), () => String(++next));
  client.receive({ type: 'ready' });
  const opening = client.open({ version: 1, hostId: 'host', name: 'Mac', publicKey: 'ab'.repeat(32),
    url: 'ws://127.0.0.1:4319' }, 'cd'.repeat(32));
  await pause();
  const connectionId = sent.at(-1).connectionId;
  client.receive({ type: 'connected', connectionId });
  await opening;
  const frames = () => sent.filter(message => message.type === 'send-preview')
    .map(message => decodePreviewFrame(message.frame));
  const fromMac = (frame: PreviewFrame) => client.receive({ type: 'preview-frame', connectionId,
    frame: encodePreviewFrame(frame) });
  return { client, frames, fromMac };
}
