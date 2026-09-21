import { OutputLedger, type OutputFrame, type Snapshot } from '../state/output';
import { previewLines } from './preview';
import type { ScreenLine } from './screen';

/** What the computer says about terminals the phone is not looking at. */
export type TerminalEvent =
  | { type: 'output'; frame: OutputFrame }
  | { type: 'resync'; sessionId: string }
  | { type: 'size'; sessionId: string; cols?: number; rows?: number };

/** A thumbnail's last lines, and the width the computer lays them out at. */
export interface Preview { lines: ScreenLine[]; cols: number }
interface Entry { ledger: OutputLedger; cols?: number; rows?: number; preview?: Preview; dirty: boolean }
/** Output lands many times a second; a thumbnail redraws at most this often. */
const PACE = 450;

/**
 * Keeps a live thumbnail of each terminal on the Projects page.
 *
 * Each one starts from the read-only `session.snapshot` — it takes no control
 * and resizes nothing — and then follows the output the computer already sends
 * this phone for every terminal, so a preview costs one request, not a poll.
 * A gap or restart in that stream is recovered the way the open terminal does
 * it: a fresh snapshot.
 */
export class PreviewFeed {
  private entries = new Map<string, Entry>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private peek: (sessionId: string) => Promise<Snapshot>, private changed: () => void,
    private count = 5) {}
  /** Follows these terminals: new ones are loaded, ones no longer shown are let go. */
  follow(ids: string[], reload = false) {
    for (const id of [...this.entries.keys()]) if (!ids.includes(id)) this.entries.delete(id);
    for (const id of ids) if (reload || !this.entries.has(id)) this.load(id);
  }
  receive(event: TerminalEvent) {
    const id = event.type === 'output' ? event.frame?.sessionId : event.sessionId;
    const entry = id ? this.entries.get(id) : undefined;
    if (!entry || !id) return;
    if (event.type === 'resync') { this.load(id); return; }
    if (event.type === 'size') {
      if (event.cols && event.rows) { entry.cols = event.cols; entry.rows = event.rows; this.mark(entry); }
      return;
    }
    const before = entry.ledger.offset;
    try { entry.ledger.push(event.frame); } catch { this.load(id); return; }
    if (entry.ledger.offset !== before) this.mark(entry);
  }
  /** What to draw: no lines for a terminal with nothing to show, undefined until it has loaded. */
  preview(id: string) { return this.entries.get(id)?.preview; }
  close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null; this.entries.clear();
  }
  private load(id: string) {
    const previous = this.entries.get(id);
    // The last lines stay up while the new snapshot is on its way, so a
    // refresh never blanks a thumbnail that was already showing something.
    const entry: Entry = { ledger: new OutputLedger(id), cols: previous?.cols, rows: previous?.rows,
      preview: previous?.preview, dirty: false };
    this.entries.set(id, entry);
    this.peek(id).then(snapshot => {
      if (this.entries.get(id) !== entry) return;
      entry.ledger.snapshot(snapshot);
      if (snapshot.cols && snapshot.rows) { entry.cols = snapshot.cols; entry.rows = snapshot.rows; }
      this.mark(entry, true);
    }).catch(() => {
      if (this.entries.get(id) !== entry) return;
      entry.preview ??= { lines: [], cols: entry.cols ?? 80 }; this.changed();
    });
  }
  private mark(entry: Entry, now = false) {
    entry.dirty = true;
    if (now && this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.timer ??= setTimeout(() => this.flush(), now ? 0 : PACE);
  }
  private flush() {
    this.timer = null;
    for (const entry of this.entries.values()) {
      if (!entry.dirty) continue;
      entry.dirty = false;
      const cols = entry.cols ?? 80;
      entry.preview = { lines: previewLines(entry.ledger.output, cols, entry.rows, this.count), cols };
    }
    this.changed();
  }
}
