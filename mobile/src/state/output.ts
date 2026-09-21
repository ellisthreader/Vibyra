export interface OutputFrame { sessionId: string; output: string; offset: number; generation: string }
export interface Snapshot extends OutputFrame {
  status: 'running' | 'exited' | 'interrupted';
  /** The grid the computer is formatting for. Absent from older hosts, which
   *  is why a viewer must still cope with never being told. */
  cols?: number; rows?: number;
  /** The computer's replay ring had already dropped older bytes, so `output`
   *  begins wherever the ring happened to wrap — often inside an escape
   *  sequence. */
  truncated?: boolean;
}
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
/**
 * Where a tail of terminal output can safely start being drawn.
 *
 * A tail cut at an arbitrary byte usually lands inside an escape sequence, and
 * xterm prints the remainder — `38;2;91;124;250m` — as letters. Every escape
 * sequence begins with ESC and none contains a line break, so starting after
 * the first line break (or, in a frame with none, at the first ESC) means the
 * worst case is a partial first line, never scattered codes.
 */
export function readableStart(text: string) {
  const newline = text.indexOf('\n');
  if (newline >= 0 && newline < 4096) return text.slice(newline + 1);
  const escape = text.indexOf('\u001b');
  if (escape > 0) return text.slice(escape);
  const code = text.charCodeAt(0);
  return code >= 0xDC00 && code <= 0xDFFF ? text.slice(1) : text;
}
function boundedTail(text: string) {
  if (text.length <= 240000) return text;
  return readableStart(text.slice(text.length - 240000));
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
    // Offsets stay exact — they count bytes the computer sent — while the text
    // drawn starts somewhere a person can read from.
    this.output = boundedTail(frame.truncated ? readableStart(frame.output) : frame.output);
    this.offset = frame.offset; this.generation = frame.generation;
    const pending = this.pending; this.pending = []; this.pendingBytes = 0;
    for (const event of pending) if (event.generation === frame.generation) this.push(event);
  }
}
