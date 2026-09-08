import type { Pairing } from './pairing';

export class RpcError extends Error {
  constructor(message: string, public uncertain = false, public code?: string) { super(message); }
}
export type Notice = { type: string; connectionId?: string; [key: string]: any };
type Pending = { method: string; resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
export class RpcClient {
  private pending = new Map<string, Pending>();
  private listeners = new Set<(notice: Notice) => void>();
  private ready = false;
  private connected = false;
  private connectionId: string | undefined;
  constructor(private post: (message: unknown) => void, private uuid: () => string) {}
  listen(callback: (notice: Notice) => void) {
    this.listeners.add(callback); return () => { this.listeners.delete(callback); };
  }
  receive = (raw: unknown) => {
    if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
    const notice = raw as Notice;
    if (notice.connectionId && notice.connectionId !== this.connectionId) return;
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
        else request.reject(new RpcError(payload.error?.message ?? 'The computer could not complete this request.', false, payload.error?.code));
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
          clearTimeout(timer); dispose(); reject(new RpcError(notice.message ?? 'Connection closed.'));
        }
      });
      const timer = setTimeout(() => { dispose(); reject(new RpcError('The computer did not respond in time.')); }, timeout);
      try { action?.(); } catch (error) { clearTimeout(timer); dispose(); reject(error); }
    });
  }
  async createKeypair() {
    await this.waitFor('ready');
    return (await this.waitFor('keypair', () => this.post({ target: 'vibyra-runtime', type: 'keygen' }))).key as string;
  }
  async open(pairing: Pairing, privateKey: string) {
    await this.waitFor('ready');
    this.connectionId = this.uuid();
    return this.waitFor('connected', () => this.post({ target: 'vibyra-runtime', type: 'open',
      pairing, privateKey, connectionId: this.connectionId, deviceName: 'Vibyra mobile' }), 110000);
  }
  request<T = any>(method: string, params: object = {}, timeout = 20000): Promise<T> {
    if (!this.connected) return Promise.reject(new RpcError('Connect to your computer first.'));
    if (this.pending.size >= 32) return Promise.reject(new RpcError('Wait for the current requests to finish.'));
    const id = this.uuid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(this.interrupted(method, 'The computer did not respond in time.'));
      }, timeout);
      this.pending.set(id, { method, resolve, reject, timer });
      try { this.post({ target: 'vibyra-runtime', type: 'send', connectionId: this.connectionId, payload: { id, method, params } }); }
      catch { clearTimeout(timer); this.pending.delete(id); reject(this.interrupted(method, 'Connection interrupted.')); }
    });
  }
  close() {
    this.post({ target: 'vibyra-runtime', type: 'close' }); this.connectionId = undefined;
    this.receive({ type: 'closed' });
  }
  private interrupted(method: string, message: string) {
    return new RpcError(method === 'session.input'
      ? 'Input delivery is uncertain. Check the terminal before sending it again.'
      : method === 'session.create' ? 'The session may have started. Reconnect, then retry this same request safely.' : message, true);
  }
  private rejectPending(message: string) {
    this.connected = false;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer); request.reject(this.interrupted(request.method, message));
    }
    this.pending.clear();
  }
}
