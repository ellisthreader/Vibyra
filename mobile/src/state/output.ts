export interface OutputFrame { sessionId: string; output: string; offset: number; generation: string }
export interface Snapshot extends OutputFrame { status: 'running' | 'exited' | 'interrupted' }
export const byteLength = (text: string) => {
  let total = 0;
  for (const char of text) { const code = char.codePointAt(0)!; total += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; }
  return total;
};
function afterBytes(text: string, skip: number) {
  let used = 0; let index = 0;
  for (const char of text) {
    if (used === skip) return text.slice(index);
    used += byteLength(char); index += char.length;
    if (used > skip) throw new Error('Terminal output has an invalid text boundary.');
  }
  return '';
}
function valid(frame: OutputFrame) {
  if (typeof frame.output !== 'string' || typeof frame.generation !== 'string' || !frame.generation ||
      !Number.isSafeInteger(frame.offset) || frame.offset < byteLength(frame.output)) {
    throw new Error('The computer returned invalid terminal output.');
  }
}
function boundedTail(text: string) {
  const start = Math.max(0, text.length - 240000);
  const code = text.charCodeAt(start);
  return text.slice(start + (code >= 0xDC00 && code <= 0xDFFF ? 1 : 0));
}
export class OutputLedger {
  output = '';
  offset = 0;
  generation: string | null = null;
  private pending: OutputFrame[] = [];
  private pendingBytes = 0;
  constructor(readonly sessionId: string) {}
  push(frame: OutputFrame): void {
    if (frame.sessionId !== this.sessionId) return;
    valid(frame);
    if (!this.generation) {
      this.pendingBytes += byteLength(frame.output);
      if (this.pending.length >= 2048 || this.pendingBytes > 512000) {
        throw new Error('Terminal output arrived too quickly. Refresh this session to catch up.');
      }
      this.pending.push(frame); return;
    }
    if (frame.generation !== this.generation) throw new Error('This terminal restarted. Refresh to load the new session.');
    if (frame.offset <= this.offset) return;
    const start = frame.offset - byteLength(frame.output);
    if (start > this.offset) throw new Error('Terminal output was interrupted. Refresh to catch up.');
    this.output = boundedTail(this.output + afterBytes(frame.output, this.offset - start));
    this.offset = frame.offset;
  }
  snapshot(frame: Snapshot): void {
    if (frame.sessionId !== this.sessionId) throw new Error('The computer returned a different terminal session.');
    valid(frame);
    this.output = boundedTail(frame.output); this.offset = frame.offset; this.generation = frame.generation;
    const pending = this.pending; this.pending = []; this.pendingBytes = 0;
    for (const event of pending) if (event.generation === frame.generation) this.push(event);
  }
}
