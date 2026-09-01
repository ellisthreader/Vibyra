// Tells Rust when a delivery has been drawn, so the flusher can hand that pane
// its next chunk. The rule on the other side is `FlushConfig::paint_timeout`
// in `vibyra-core/src/pty/flush_pacing.rs`: one unpainted chunk per pane, so a
// machine that paints slowly is asked to paint less often instead of being
// handed a backlog it can never draw — and the clicks queued behind it.
//
// Reported once per animation frame for every pane that finished a write in
// it, not once per write. The frame is what the renderer pays for, and a
// replayed queue can put dozens of writes into one.
//
// Pure on purpose: `terminalEvents` binds it to the IPC call, so this stays
// testable without a webview.

export function createPaintReporter(
  report: (id: number) => Promise<void>,
  schedule: (callback: () => void) => void = (callback) => {
    requestAnimationFrame(callback);
  },
): (id: number) => void {
  const painted = new Set<number>();
  let framePending = false;
  return (id) => {
    painted.add(id);
    if (framePending) return;
    framePending = true;
    schedule(() => {
      framePending = false;
      const ids = [...painted];
      painted.clear();
      // A pane closed between the write and the frame is simply gone; Rust
      // answers with a session-not-found error that means nothing here.
      for (const paintedId of ids) void report(paintedId).catch(() => {});
    });
  };
}
