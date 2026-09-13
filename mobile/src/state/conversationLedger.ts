import type { AgentItem, ConversationEvent, ConversationSnapshot } from './conversationTypes';

export class ConversationLedger {
  value: ConversationSnapshot | null = null;
  private queued: ConversationEvent[] = [];
  constructor(readonly sessionId: string, readonly projectId: string) {}
  snapshot(value: ConversationSnapshot) {
    if (!this.matches(value) || !Array.isArray(value.items) || !Number.isSafeInteger(value.cursor)) {
      throw new Error('The conversation could not be read. Reconnect to catch up.');
    }
    if (this.value?.generation === value.generation && this.value.cursor > value.cursor) return this.value;
    const authoritative = new Set([...value.items, ...(value.pending ?? [])].map(item => item.id));
    const retained = this.value?.generation === value.generation ? this.value.items.map(item =>
      !authoritative.has(item.id) && ['pending', 'responding'].includes(item.status)
        ? { ...item, status: item.status === 'pending' ? 'expired' : 'unknown' } : item) : [];
    this.value = { ...value, items: mergeItems(mergeItems(retained, value.items), value.pending ?? []) };
    const events = this.queued; this.queued = [];
    for (const event of events.sort((a, b) => a.cursor - b.cursor)) this.push(event);
    return this.value;
  }
  prepend(value: ConversationSnapshot) {
    if (!this.value || !this.matches(value) || value.generation !== this.value.generation) return;
    this.value = { ...this.value, hasMore: value.hasMore, items: mergeItems(value.items, this.value.items) };
  }
  push(event: ConversationEvent): boolean {
    if (!this.matches(event)) return false;
    if (!this.value) { this.queued.push(event); this.queued = this.queued.slice(-256); return false; }
    if (event.generation !== this.value.generation) throw new Error('The conversation restarted. Reconnect to catch up.');
    if (event.cursor <= this.value.cursor) return false;
    if (event.cursor !== this.value.cursor + 1) { this.queued.push(event); this.queued = this.queued.slice(-256); throw new Error('Catching up with your conversation…'); }
    this.value = { ...this.value, ...event, items: event.item ? mergeItems(this.value.items, [event.item]) : this.value.items };
    return true;
  }
  private matches(value: { sessionId: string; projectId: string }) {
    return value.sessionId === this.sessionId && value.projectId === this.projectId;
  }
}
function mergeItems(items: AgentItem[], next: AgentItem[]) {
  const merged = [...items];
  for (const item of next) {
    const index = merged.findIndex(previous => previous.id === item.id);
    if (index < 0) merged.push(item); else merged[index] = item;
  }
  merged.sort((a, b) => (a.order ?? a.cursor ?? 0) - (b.order ?? b.cursor ?? 0));
  while (merged.length > 512) {
    const index = merged.findIndex(item => !['pending', 'responding'].includes(item.status));
    if (index < 0) break;
    merged.splice(index, 1);
  }
  return merged;
}
