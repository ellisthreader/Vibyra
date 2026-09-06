import { randomUUID } from 'expo-crypto';
import type { Pairing } from './pairing';

type Pending = { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
type Notice = { type: string; [key: string]: any };
export class RpcClient {
  private pending = new Map<string, Pending>();
  private listeners = new Set<(notice: Notice) => void>();
  private ready = false;
  private connected = false;
  constructor(private post: (message: unknown) => void) {}
  listen(callback: (notice: Notice) => void) { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; }
  receive = (raw: unknown) => {
    if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
    const notice = raw as Notice;
    if (notice.type === 'ready') this.ready = true;
    if (notice.type === 'connected') this.connected = true;
    if (notice.type === 'closed' || notice.type === 'error') this.rejectPending(notice.message ?? 'Connection interrupted.');
    if (notice.type === 'message') {
      const payload = notice.payload;
      if (!payload || typeof payload !== 'object') return;
      const request = this.pending.get(payload.id);
      if (request) {
        clearTimeout(request.timer); this.pending.delete(payload.id);
        if (payload.ok === true) request.resolve(payload.result);
        else request.reject(new Error(payload.error?.message ?? 'The computer could not complete this request.'));
      }
    }
    for (const listener of this.listeners) listener(notice);
  };
  async waitFor(type: string, action?: () => void, timeout = 15000): Promise<Notice> {
    if (type === 'ready' && this.ready) return { type: 'ready' };
    return new Promise((resolve, reject) => {
      const dispose = this.listen(notice => {
        if (notice.type === type) { clearTimeout(timer); dispose(); resolve(notice); }
        else if (notice.type === 'error' || notice.type === 'closed') {
          clearTimeout(timer); dispose(); reject(new Error(notice.message ?? 'Connection closed.'));
        }
      });
      const timer = setTimeout(() => { dispose(); reject(new Error('The computer did not respond in time.')); }, timeout);
      action?.();
    });
  }
  async createKeypair() {
    await this.waitFor('ready');
    return (await this.waitFor('keypair', () => this.post({ target: 'vibyra-runtime', type: 'keygen' }))).key as string;
  }
  async open(pairing: Pairing, privateKey: string) {
    await this.waitFor('ready');
    return this.waitFor('connected', () => this.post({ target: 'vibyra-runtime', type: 'open', pairing, privateKey, deviceName: 'Vibyra mobile' }), 110000);
  }
  request<T = any>(method: string, params: object = {}, timeout = 20000): Promise<T> {
    if (!this.connected) return Promise.reject(new Error('Connect to your computer first.'));
    if (this.pending.size >= 32) return Promise.reject(new Error('Wait for the current requests to finish.'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(method === 'session.input' ? 'Input delivery is uncertain. Check the terminal before sending it again.' : 'The computer did not respond in time.'));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.post({ target: 'vibyra-runtime', type: 'send', payload: { id, method, params } });
    });
  }
  close() { this.post({ target: 'vibyra-runtime', type: 'close' }); this.rejectPending('Disconnected.'); }
  private rejectPending(message: string) {
    this.connected = false;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error(message)); }
    this.pending.clear();
  }
}
