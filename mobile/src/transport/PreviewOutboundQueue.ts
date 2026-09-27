/** Preserves each stream's wire order while letting Credits pass frames from
 * other streams. A canceled stream loses its unsent frames. */
export class PreviewOutboundQueue {
  private items: { frame: Uint8Array; key: string; urgent: boolean }[] = [];
  private size = 0;
  private urgentRun = 0;
  constructor(private limit = 128 * 1024) {}
  get length(): number {
    return this.items.length;
  }
  get byteLength(): number {
    return this.size;
  }
  clear(): void {
    this.items = [];
    this.size = 0;
    this.urgentRun = 0;
  }
  cancelKey(key: string): void {
    this.items = this.items.filter((item) => {
      if (item.key !== key) return true;
      this.size -= item.frame.length;
      return false;
    });
  }
  push(frame: Uint8Array, key: string, urgent: boolean): void {
    if (this.size + frame.length > this.limit)
      throw new Error('Preview is waiting for the connection.');
    const item = { frame, key, urgent };
    if (urgent) {
      const firstNormal = this.items.findIndex((queued) => !queued.urgent);
      const lastOwn = this.items.findLastIndex((queued) => queued.key === key);
      // Cloud pacing can queue Open and its initial response Credit together.
      // Credit before Open is rejected by the Mac and cancels the page request.
      this.items.splice(Math.max(firstNormal < 0 ? this.items.length : firstNormal,
        lastOwn + 1), 0, item);
    } else this.items.push(item);
    this.size += frame.length;
  }
  pop(): Uint8Array | undefined {
    // A busy page can replenish several response windows continuously. Let
    // one ordered request through after a bounded run of Credits so new page
    // navigation is not trapped behind image traffic.
    let ordered = -1;
    if (this.urgentRun >= 8) {
      const earlier = new Set<string>();
      for (let index = 0; index < this.items.length; index++) {
        const item = this.items[index];
        if (!item.urgent && !earlier.has(item.key)) { ordered = index; break; }
        earlier.add(item.key);
      }
    }
    const [item] = this.items.splice(ordered < 0 ? 0 : ordered, 1);
    if (item) {
      this.size -= item.frame.length;
      this.urgentRun = item.urgent ? this.urgentRun + 1 : 0;
    }
    return item?.frame;
  }
}
