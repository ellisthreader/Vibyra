type Job<T> = {
  kind: "save" | "barrier";
  value?: T;
  operation?: () => Promise<void>;
  promise: Promise<boolean>;
  finish: (ok: boolean) => void;
};

// Only adjacent pending snapshots can replace one another. Credential clears
// are barriers, so a slow save cannot overtake logout or an account switch.
export function createPersistenceWriteQueue<T>(write: (value: T) => Promise<void>) {
  const queue: Job<T>[] = [];
  let running = false;
  async function drain() {
    if (running) return;
    running = true;
    while (queue.length) {
      const job = queue.shift()!;
      try {
        if (job.kind === "save") await write(job.value as T);
        else await job.operation!();
        job.finish(true);
      } catch {
        job.finish(false);
      }
    }
    running = false;
  }
  function enqueue(kind: Job<T>["kind"], value?: T, operation?: Job<T>["operation"]) {
    let finish!: (ok: boolean) => void;
    const promise = new Promise<boolean>((resolve) => { finish = resolve; });
    queue.push({ kind, value, operation, promise, finish });
    void drain();
    return promise;
  }
  return {
    save(value: T) {
      const last = queue[queue.length - 1];
      if (last?.kind === "save") {
        last.value = value;
        return last.promise;
      }
      return enqueue("save", value);
    },
    barrier: (operation: () => Promise<void>) => enqueue("barrier", undefined, operation)
  };
}
