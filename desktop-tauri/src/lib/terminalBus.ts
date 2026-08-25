import type { TermEvent } from "../types";

// Routes per-session IPC events to whichever terminal instance is currently
// mounted. Events that arrive while no handler is attached (pane not mounted
// yet, or being remounted) are queued and replayed on attach, so no output
// is ever dropped on the frontend side.

type Handler = (event: TermEvent) => void;

/** A pane can stay unmounted while Rust still delivers for it (the sink only
 * detaches on remove). Unbounded, that queue is a slow memory leak; past this
 * many queued characters the oldest output is dropped. Agent TUIs repaint the
 * whole viewport constantly, so a remount self-heals within one delivery. */
export const QUEUE_CAP_CHARS = 2_000_000;

const handlers = new Map<number, Handler>();
const queues = new Map<number, TermEvent[]>();
const queueChars = new Map<number, number>();
const discarded = new Set<number>();

function eventChars(event: TermEvent): number {
  return event.type === "exit" ? 0 : event.data.length;
}

/** Drops oldest output first; resync and exit markers must survive because
 * `replay` orders the handoff around them. */
function boundQueue(id: number, queue: TermEvent[]): void {
  let total = queueChars.get(id) ?? 0;
  let index = 0;
  while (total > QUEUE_CAP_CHARS && index < queue.length) {
    const event = queue[index];
    if (event.type !== "output") {
      index += 1;
      continue;
    }
    total -= event.data.length;
    queue.splice(index, 1);
  }
  queueChars.set(id, total);
}

export function dispatch(id: number, event: TermEvent): void {
  // A killed PTY may deliver its final exit event after teardown. Native ids
  // are never reused in one app process, so dropping it prevents an orphaned
  // queue from accumulating across repeated restarts.
  if (discarded.has(id)) return;
  const handler = handlers.get(id);
  if (handler) {
    handler(event);
    return;
  }
  const queue = queues.get(id) ?? [];
  queue.push(event);
  queues.set(id, queue);
  queueChars.set(id, (queueChars.get(id) ?? 0) + eventChars(event));
  boundQueue(id, queue);
}

export function attach(id: number, handler: Handler): void {
  handlers.set(id, handler);
  const queue = queues.get(id);
  if (queue) {
    queues.delete(id);
    queueChars.delete(id);
    replay(queue, handler);
  }
}

/**
 * A hidden terminal can exit and then be woken before React remounts it. In
 * that case Rust legitimately sends output, exit, then a full resync. The
 * resync supersedes every earlier output chunk, while the exit marker still
 * belongs last. Normalising here prevents stale writes racing a terminal
 * reset and keeps an exited pane's final marker visible.
 */
export function replay(events: TermEvent[], handler: Handler): void {
  let resyncAt = -1;
  let exit: TermEvent | undefined;
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].type === "resync") resyncAt = index;
    if (events[index].type === "exit") exit = events[index];
  }
  if (resyncAt < 0) {
    for (const event of events) handler(event);
    return;
  }
  for (const event of events.slice(resyncAt)) {
    if (event.type !== "exit") handler(event);
  }
  if (exit) handler(exit);
}

export function detach(id: number): void {
  handlers.delete(id);
}

export function clear(id: number): void {
  handlers.delete(id);
  queues.delete(id);
  queueChars.delete(id);
  discarded.add(id);
}
