import type { TermEvent } from "../types";

// Routes per-session IPC events to whichever terminal instance is currently
// mounted. Events that arrive while no handler is attached (pane not mounted
// yet, or being remounted) are queued and replayed on attach, so no output
// is ever dropped on the frontend side.

type Handler = (event: TermEvent) => void;

const handlers = new Map<number, Handler>();
const queues = new Map<number, TermEvent[]>();

export function dispatch(id: number, event: TermEvent): void {
  const handler = handlers.get(id);
  if (handler) {
    handler(event);
    return;
  }
  const queue = queues.get(id) ?? [];
  queue.push(event);
  queues.set(id, queue);
}

export function attach(id: number, handler: Handler): void {
  handlers.set(id, handler);
  const queue = queues.get(id);
  if (queue) {
    queues.delete(id);
    for (const event of queue) {
      handler(event);
    }
  }
}

export function detach(id: number): void {
  handlers.delete(id);
}

export function clear(id: number): void {
  handlers.delete(id);
  queues.delete(id);
}
