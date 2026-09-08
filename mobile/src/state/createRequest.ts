import { RpcError } from '../transport/RpcClient';
import type { SessionKind } from '../ui/types';

// Keep one token for the same user intent until an authoritative response arrives.
export class CreateRequests {
  private ids = new Map<string, string>();
  constructor(private uuid: () => string) {}
  key(host: string, project: string, kind: SessionKind, title: string) { return JSON.stringify([host, project, kind, title]); }
  begin(key: string) {
    if (!this.ids.has(key) && this.ids.size >= 32) throw new Error('Resolve pending session requests before starting more work.');
    const id = this.ids.get(key) ?? this.uuid(); this.ids.set(key, id); return id;
  }
  success(key: string) { this.ids.delete(key); }
  failed(key: string, error: unknown) {
    if (error instanceof RpcError && !error.uncertain) this.ids.delete(key);
  }
  clear() { this.ids.clear(); }
  serialize() { return JSON.stringify([...this.ids]); }
  restore(value: string | null) {
    if (!value) return;
    const entries: unknown = JSON.parse(value);
    if (!Array.isArray(entries) || entries.length > 32 || entries.some(item => !Array.isArray(item) ||
      item.length !== 2 || typeof item[0] !== 'string' || item[0].length > 2048 ||
      typeof item[1] !== 'string' || item[1].length < 1 || item[1].length > 80)) {
      throw new Error('Pending session requests could not be restored.');
    }
    this.ids = new Map(entries);
  }
}
