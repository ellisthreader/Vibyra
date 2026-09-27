import type { TermEvent } from "../types";
import { emptyBacklog, queueEvent, type Backlog } from "./terminalBacklog.ts";

// Routes per-session IPC events to whichever terminal instance is currently
// mounted. Events that arrive while no handler is attached (pane not mounted
// yet, or being remounted) are queued and replayed on attach. Nothing is
// dropped that the view would still show: `terminalBacklog.ts` only discards
// output a resync is about to replace, and collapses a backlog too large to
// replay into the resync Rust itself would send.

type Handler = (event: TermEvent) => void;

const handlers = new Map<number, Handler>();
const queues = new Map<number, Backlog>();
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
  queues.set(id, queueEvent(queues.get(id) ?? emptyBacklog(), event));
}

export function attach(id: number, handler: Handler): void {
  handlers.set(id, handler);
  const queue = queues.get(id);
  if (queue) {
    queues.delete(id);
    for (const event of queue.events) {
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
