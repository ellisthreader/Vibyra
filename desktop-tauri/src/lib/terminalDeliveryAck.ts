// Tells Rust when a delivery has been drawn, so the flusher can hand that pane
// its next chunk. The rule on the other side is `FlushConfig::paint_timeout`
// in `vibyra-core/src/pty/flush_pacing.rs`: one unpainted chunk per pane, so a
// machine that paints slowly is asked to paint less often instead of being
// handed a backlog it can never draw — and the clicks queued behind it.
//
// Reported once per animation frame, as one call naming every pane that
// finished a write in it — not once per write and not once per pane. The frame
// is what the renderer pays for, a replayed queue can put dozens of writes
// into one, and each IPC call costs the same main thread the paint does.
//
// Pure on purpose: `terminalEvents` binds it to the IPC call, so this stays
// testable without a webview.

export function createPaintReporter(
  report: (ids: number[]) => Promise<void>,
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
      // Rust skips a pane closed between the write and the frame; a failed
      // call is covered by its paint timeout and means nothing here.
      void report(ids).catch(() => {});
    });
  };
}
