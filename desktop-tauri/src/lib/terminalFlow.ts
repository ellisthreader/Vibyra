// Flow control for one terminal view. Rust delivers output as fast as the
// program prints it, and `term.write` only queues: a flood (`yes`, `cat` of a
// large log) outruns the parser, the queue grows without bound, and past
// 50 MB xterm starts discarding writes. So the view counts what it has handed
// xterm but xterm has not parsed yet, and past a high-water mark asks Rust to
// hold the rest; Rust keeps it (overflowing into one bounded resync) until the
// view drains below the low-water mark. Kept free of imports so these rules
// can be tested directly.

/** Unparsed output, in characters, at which Rust is asked to hold. */
export const HIGH_WATER = 2 * 1024 * 1024;
/** And the level the view must fall back below before it lets output flow. */
export const LOW_WATER = 512 * 1024;
/** Rust lets a hold lapse after 3 s; a view still behind renews it sooner. */
const RENEW_MS = 2_000;

export interface OutputFlow {
  /** Accounts for `chars` handed to `term.write`; call the result from that
   * write's callback, once xterm has parsed them. */
  written(chars: number): () => void;
}

export function outputFlow(hold: (on: boolean) => void, now: () => number = Date.now): OutputFlow {
  let unparsed = 0;
  let held = false;
  let heldAt = 0;
  return {
    written(chars) {
      unparsed += chars;
      if (unparsed > HIGH_WATER && (!held || now() - heldAt >= RENEW_MS)) {
        held = true;
        heldAt = now();
        hold(true);
      }
      return () => {
        unparsed -= chars;
        if (held && unparsed < LOW_WATER) {
          held = false;
          hold(false);
        }
      };
    },
  };
}
