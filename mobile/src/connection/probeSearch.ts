import type { DiscoveryUpdate, NearbyComputer } from './discoveryTypes';
import { PROBE_PORTS, type ProbePlan } from './probeTargets';

type Probe = (host: string, port: number, signal: AbortSignal) => Promise<NearbyComputer | undefined>;

/** One bounded search, with repeat passes for computers that wake up or start
 *  sharing while the screen is open. Dismissal cancels in-flight work too. */
export function startProbeSearch(resolvePlan: () => Promise<ProbePlan | undefined>, probe: Probe,
  onUpdate: (update: DiscoveryUpdate) => void, options = { window: 30000, gap: 1400, parallel: 24 }) {
  const control = new AbortController();
  const found = new Map<string, NearbyComputer>();
  let disposed = false;
  const publish = (value: DiscoveryUpdate) => { if (!disposed) onUpdate(value); };
  const deadline = setTimeout(() => {
    control.abort();
    publish({ status: 'finished', computers: [...found.values()] });
  }, options.window);
  const run = async () => {
    let attempt = 0;
    while (!control.signal.aborted) {
      const plan = await resolvePlan();
      if (control.signal.aborted) return;
      if (!plan?.hosts.length) {
        publish({ status: 'unavailable', computers: [] });
        clearTimeout(deadline);
        return;
      }
      attempt += 1;
      const queue = plan.hosts.flatMap(host => PROBE_PORTS.map(port => ({ host, port })));
      const answered = new Set<string>();
      let next = 0, checked = 0;
      const progress = () => {
        if (!control.signal.aborted) publish({ status: 'searching', computers: [...found.values()],
          progress: { checked, total: queue.length, attempt } });
      };
      progress();
      const worker = async () => {
        while (next < queue.length && !control.signal.aborted) {
          const item = queue[next++];
          const computer = await probe(item.host, item.port, control.signal);
          if (control.signal.aborted) return;
          checked += 1;
          if (computer && !answered.has(computer.id)) {
            // Refresh endpoints between passes; one identity is one computer.
            answered.add(computer.id);
            found.set(computer.id, computer);
          }
          if (computer || checked % 8 === 0 || checked === queue.length) progress();
        }
      };
      await Promise.all(Array.from({ length: Math.min(options.parallel, queue.length) }, worker));
      if (control.signal.aborted) return;
      for (const id of found.keys()) if (!answered.has(id)) found.delete(id);
      progress();
      await pause(options.gap, control.signal);
    }
  };
  void run().catch(() => {
    if (!control.signal.aborted) {
      control.abort();
      clearTimeout(deadline);
      publish({ status: 'failed', computers: [...found.values()] });
    }
  });
  return () => { disposed = true; clearTimeout(deadline); control.abort(); };
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const timer = setTimeout(finish, ms);
    function finish() { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); }
    signal.addEventListener('abort', finish);
    if (signal.aborted) finish();
  });
}
