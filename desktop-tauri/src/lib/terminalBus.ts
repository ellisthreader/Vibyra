import type { TermEvent } from "../types";

// Routes per-session IPC events to whichever terminal instance is currently
// mounted. Events that arrive while no handler is attached (pane not mounted
// yet, or being remounted) are queued and replayed on attach, so no output
// is ever dropped on the frontend side.

type Handler = (event: TermEvent) => void;

const handlers = new Map<number, Handler>();
const queues = new Map<number, TermEvent[]>();
const exits = new Map<number, number | null>();
let onExit: (id: number, code: number | null) => void = () => {};

export function setExitHandler(handler: typeof onExit): void { onExit = handler; }
export function sessionExitCode(id: number): number | null | undefined { return exits.get(id); }

export function dispatch(id: number, event: TermEvent): void {
  if (event.type === "exit") {
    exits.set(id, event.code);
    onExit(id, event.code);
  }
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
  exits.delete(id);
  handlers.delete(id);
  queues.delete(id);
}
