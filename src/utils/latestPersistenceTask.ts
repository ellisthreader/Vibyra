// Coalesce replaceable snapshots before normalization, with a bounded delay.
// Callers must cancel on identity changes and flush on lifecycle transitions.
let generation = 0;
export function invalidatePendingPersistence() { generation++; }

export function createLatestPersistenceTask(delayMs = 200) {
  let pending: (() => void) | null = null;
  let scheduledGeneration = generation;
  let timer: ReturnType<typeof setTimeout> | null = null;
  function cancel() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  }
  function flush() {
    const work = pending;
    cancel();
    if (scheduledGeneration === generation) work?.();
  }
  return {
    schedule(work: () => void) {
      pending = work;
      scheduledGeneration = generation;
      // Do not postpone indefinitely when a stream keeps producing deltas.
      if (timer === null) timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel
  };
}
