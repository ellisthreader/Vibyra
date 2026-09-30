/** Keeps cumulative Credit frames in wire order while moving them ahead of
 * ordinary Preview payloads. A canceled stream loses its unsent frames. */
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
      this.items.splice(firstNormal < 0 ? this.items.length : firstNormal, 0, item);
    } else this.items.push(item);
    this.size += frame.length;
  }
  pop(): Uint8Array | undefined {
    // A busy page can replenish several response windows continuously. Let
    // one ordered request through after a bounded run of Credits so new page
    // navigation is not trapped behind image traffic.
    const ordered = this.urgentRun >= 8 ? this.items.findIndex(item => !item.urgent) : -1;
    const [item] = this.items.splice(ordered < 0 ? 0 : ordered, 1);
    if (item) {
      this.size -= item.frame.length;
      this.urgentRun = item.urgent ? this.urgentRun + 1 : 0;
    }
    return item?.frame;
  }
}
