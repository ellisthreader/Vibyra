/** Keep each PTY's input in the order xterm emitted it. Tauri IPC commands can
 * run on different tasks, so firing an invoke for every key can reorder keys,
 * Backspace, and Enter before they reach the PTY. While one write is in flight,
 * combine subsequent input into one write without changing its byte order. */
export function createOrderedTerminalWriter<Key extends string | number>(
  send: (key: Key, data: string) => Promise<void>,
): (key: Key, data: string) => Promise<void> {
  type Entry = { data: string; resolve: () => void; reject: (error: unknown) => void };
  type Queue = { pending: Entry[]; writing: boolean };
  const queues = new Map<Key, Queue>();

  async function drain(key: Key, queue: Queue): Promise<void> {
    try {
      while (queue.pending.length) {
        const batch = queue.pending.splice(0);
        try {
          await send(key, batch.map((entry) => entry.data).join(""));
          for (const entry of batch) entry.resolve();
        } catch (error) {
          for (const entry of batch) entry.reject(error);
        }
      }
    } finally {
      queue.writing = false;
      if (queues.get(key) === queue) queues.delete(key);
    }
  }

  return (key, data) => new Promise<void>((resolve, reject) => {
    let queue = queues.get(key);
    if (!queue) {
      queue = { pending: [], writing: false };
      queues.set(key, queue);
    }
    queue.pending.push({ data, resolve, reject });
    if (!queue.writing) {
      queue.writing = true;
      void drain(key, queue);
    }
  });
}
