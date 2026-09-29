import type { FocusedTextTarget, TextSelection, FocusedTextReply } from './types';

export interface TextFieldAdapter {
  fieldId: string; label: string; context: string; maxLength: number; multiline: boolean;
  read(): { text: string; selection: TextSelection };
  apply(text: string, selection: TextSelection): void;
}
type Lease = { owner: string; token: string; expires: number };
const expired = () => new Error('The Mac field changed. Reopen the keyboard to continue.');

/** Serial, synchronous commits to a registered field. No keystroke or submit APIs. */
export class PhoneTextController {
  private field: TextFieldAdapter | null = null;
  private target: FocusedTextTarget | null = null;
  private lease: Lease | null = null;
  private receipts = new Map<string, { input: string; reply: FocusedTextReply }>();
  private uuid: () => string;
  private now: () => number;
  constructor(uuid: () => string, now = () => Date.now()) { this.uuid = uuid; this.now = now; }
  revoke(owner: string) { if (this.lease?.owner === owner) this.lease = null; }

  focus(field: TextFieldAdapter | null) {
    if (field === this.field) return;
    this.field = field; this.lease = null; this.receipts.clear();
    this.target = field ? { id: this.uuid(), fieldId: field.fieldId, label: field.label,
      context: field.context, maxLength: field.maxLength, multiline: field.multiline,
      ...field.read(), revision: 0 } : null;
  }
  /** Local cursor movement, typing, dictation and programmatic value changes win. */
  localChange() {
    if (!this.field || !this.target) return;
    this.target = { ...this.target, ...this.field.read(), revision: this.target.revision + 1 };
    this.lease = null;
  }
  private sync() {
    if (!this.field || !this.target) return;
    const value = this.field.read(), old = this.target;
    if (value.text !== old.text || value.selection.start !== old.selection.start || value.selection.end !== old.selection.end)
      this.localChange();
  }
  private result(): FocusedTextReply {
    return { target: this.target ? { ...this.target, selection: { ...this.target.selection } } : null };
  }
  handle(owner: string, method: string, params: Record<string, unknown>): FocusedTextReply {
    this.sync();
    if (this.lease && this.lease.expires <= this.now()) this.lease = null;
    if (method === 'focusedText.snapshot') {
      if (this.lease?.owner === owner && this.lease.token === params.lease) this.lease.expires = this.now() + 30_000;
      return this.result();
    }
    const target = this.target, field = this.field;
    if (!target || !field || params.targetId !== target.id) throw expired();
    if (method === 'focusedText.claim') {
      if (this.lease && this.lease.owner !== owner) throw new Error('Another phone is editing this field.');
      if (params.revision !== target.revision) throw expired();
      this.lease = { owner, token: this.uuid(), expires: this.now() + 30_000 };
      return { ...this.result(), lease: this.lease.token };
    }
    if (!this.lease || this.lease.owner !== owner || this.lease.token !== params.lease) throw expired();
    if (method === 'focusedText.release') { this.lease = null; return { target: null }; }
    if (method !== 'focusedText.edit') throw new Error('Unsupported keyboard action.');
    const { editId, text, selection, revision } = params;
    if (typeof editId !== 'string' || editId.length < 1 || editId.length > 128) throw new Error('Invalid edit identity.');
    const input = JSON.stringify(params);
    const previous = this.receipts.get(editId);
    if (previous) {
      if (previous.input !== input) throw new Error('An edit identity cannot be reused for different text.');
      return previous.reply;
    }
    if (revision !== target.revision) throw expired();
    const range = selection as TextSelection | undefined;
    if (typeof text !== 'string' || text.length > field.maxLength ||
        JSON.stringify(text).length > 12_000 || new TextEncoder().encode(JSON.stringify(text)).length > 32_000 ||
        (!field.multiline && /[\r\n]/.test(text)) ||
        !range || !Number.isInteger(range.start) || !Number.isInteger(range.end) ||
        range.start < 0 || range.end < range.start || range.end > text.length)
      throw new Error('This edit exceeds the field limits or has an invalid selection.');
    field.apply(text, range);
    const applied = field.read();
    if (applied.text !== text) { this.localChange(); throw new Error('The Mac could not apply this edit. Your phone draft is kept.'); }
    this.target = { ...target, ...applied, revision: target.revision + 1 };
    this.lease.expires = this.now() + 30_000;
    const reply = this.result();
    this.receipts.set(editId, { input, reply });
    if (this.receipts.size > 128) this.receipts.delete(this.receipts.keys().next().value!);
    return reply;
  }
}
