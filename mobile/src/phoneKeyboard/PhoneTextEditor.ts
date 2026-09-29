import type { FocusedTextRequest, FocusedTextTarget, TextSelection } from './types';

export interface EditorState {
  target: FocusedTextTarget | null; text: string; selection: TextSelection;
  pending: boolean; paused: boolean; error: string;
}
/** One in-flight replacement. Late acknowledgements never replace newer typing. */
export class PhoneTextEditor {
  state: EditorState = { target: null, text: '', selection: { start: 0, end: 0 }, pending: false, paused: true, error: '' };
  private listeners = new Set<() => void>();
  private lease: string | undefined;
  private epoch = 0;
  private dirty = false;
  private inFlight = false;
  private polling = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private request: FocusedTextRequest, private uuid: () => string) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.state;
  private update(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn());
  }
  async open() {
    const epoch = ++this.epoch;
    clearTimeout(this.timer); this.lease = undefined; this.dirty = false; this.inFlight = false;
    this.update({ paused: true, pending: true, error: '' });
    try {
      const { target } = await this.request('snapshot');
      if (epoch !== this.epoch) return;
      if (!target) throw new Error('Click a supported text box in Vibyra on your Mac.');
      const claimed = await this.request('claim', { targetId: target.id, revision: target.revision });
      if (epoch !== this.epoch) {
        if (claimed.lease) void this.request('release', { targetId: target.id, lease: claimed.lease }).catch(() => {});
        return;
      }
      if (!claimed.target || claimed.target.id !== target.id || !claimed.lease) throw new Error('The Mac field changed. Try again.');
      this.lease = claimed.lease;
      this.update({ target: claimed.target, text: claimed.target.text, selection: claimed.target.selection, pending: false, paused: false });
    } catch (error) { if (epoch === this.epoch) this.pause(String(error)); }
  }
  edit(text: string, selection?: TextSelection) {
    if (this.state.paused || !this.state.target) return;
    if (!selection) {
      let prefix = 0, suffix = 0;
      const old = this.state.text;
      while (prefix < old.length && prefix < text.length && old[prefix] === text[prefix]) prefix++;
      while (suffix < old.length - prefix && suffix < text.length - prefix && old[old.length - suffix - 1] === text[text.length - suffix - 1]) suffix++;
      selection = { start: text.length - suffix, end: text.length - suffix };
    }
    const range = { start: Math.min(selection.start, text.length), end: Math.min(selection.end, text.length) };
    this.dirty = true;
    this.update({ text, selection: range, pending: true });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, 35);
  }
  select(selection: TextSelection) {
    if (selection.start === this.state.selection.start && selection.end === this.state.selection.end) return;
    this.edit(this.state.text, selection);
  }
  private async flush() {
    if (this.inFlight || !this.dirty || this.state.paused || !this.lease || !this.state.target) return;
    const epoch = this.epoch, target = this.state.target, text = this.state.text, selection = this.state.selection;
    this.inFlight = true; this.dirty = false;
    try {
      const result = await this.request('edit', { targetId: target.id, lease: this.lease,
        editId: this.uuid(), revision: target.revision, text, selection });
      if (epoch !== this.epoch) return;
      if (!result.target || result.target.id !== target.id || result.target.text !== text || result.target.revision !== target.revision + 1)
        throw new Error('The Mac could not confirm this edit. Your text is kept here.');
      this.update({ target: result.target, pending: this.dirty });
    } catch (error) {
      if (epoch === this.epoch) this.pause(`${String(error)} Your unconfirmed text is kept here.`);
    } finally {
      if (epoch === this.epoch) { this.inFlight = false; if (this.dirty && !this.state.paused) void this.flush(); }
    }
  }
  async poll() {
    if (this.polling || this.inFlight || this.dirty || this.state.paused || !this.state.target) return;
    const epoch = this.epoch, target = this.state.target;
    this.polling = true;
    try {
      const next = await this.request('snapshot', { lease: this.lease });
      if (epoch !== this.epoch || this.inFlight || this.dirty || this.state.target?.revision !== target.revision) return;
      if (!next.target || next.target.id !== target.id || next.target.revision !== target.revision)
        this.pause('The Mac field changed. Your phone text is kept. Reopen to use the current Mac field.');
    } catch (error) { if (epoch === this.epoch) this.pause(String(error)); }
    finally { this.polling = false; }
  }
  private pause(error: string) {
    clearTimeout(this.timer); this.update({ paused: true, pending: false, error });
  }
  close(clear = true) {
    ++this.epoch; clearTimeout(this.timer);
    const lease = this.lease, targetId = this.state.target?.id;
    this.lease = undefined;
    if (lease && targetId) void this.request('release', { lease, targetId }).catch(() => {});
    this.update(clear ? { target: null, text: '', selection: { start: 0, end: 0 }, paused: true, pending: false, error: '' }
      : { paused: true, pending: false, error: 'Keyboard closed. Your phone copy is kept until you load the current Mac field.' });
  }
}
