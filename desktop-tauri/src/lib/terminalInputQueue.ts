export type TerminalInputWriter = (id: number, data: string) => Promise<void>;

interface PendingInput {
  data: string;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

interface SessionInputQueue {
  pending: PendingInput[];
  running: boolean;
}

/**
 * Serialises terminal input per PTY while coalescing keys typed during an IPC
 * round trip. Tauri commands may run concurrently, but a terminal byte stream
 * must arrive in exactly the order xterm emitted it.
 */
export function createTerminalInputQueue(writer: TerminalInputWriter): TerminalInputWriter {
  const sessions = new Map<number, SessionInputQueue>();

  const drain = async (id: number, queue: SessionInputQueue): Promise<void> => {
    queue.running = true;
    while (queue.pending.length > 0) {
      const batch = queue.pending.splice(0);
      try {
        await writer(
          id,
          batch.map((input) => input.data).join(""),
        );
        for (const input of batch) input.resolve();
      } catch (error) {
        for (const input of batch) input.reject(error);
      }
    }
    queue.running = false;
    if (sessions.get(id) === queue) sessions.delete(id);
  };

  return (id, data) =>
    new Promise<void>((resolve, reject) => {
      const queue = sessions.get(id) ?? { pending: [], running: false };
      queue.pending.push({ data, resolve, reject });
      sessions.set(id, queue);
      if (!queue.running) void drain(id, queue);
    });
}
