export interface NativeActivation { id: string; account: string; agentId: string; runId: string }
type Stop = () => void;
interface ResponseBridge {
  listen(wake: () => void): Promise<Stop>;
  drain(): Promise<NativeActivation[]>;
  account(): string | null;
  open(activation: NativeActivation): void;
}

/** Only the native delegate queue can authorize navigation. Focus and event payloads cannot. */
export async function startNativeNotificationResponses(bridge: ResponseBridge): Promise<Stop> {
  let alive = true, busy = false, again = false;
  const seen = new Set<string>();
  const drain = async () => {
    if (busy) { again = true; return; }
    busy = true;
    try {
      do {
        again = false;
        const owner = bridge.account();
        if (!owner) return;
        const activations = await bridge.drain();
        if (!alive || owner !== bridge.account()) return;
        for (const item of activations.slice(-32)) {
          if (item.account !== owner || seen.has(item.id)) continue;
          seen.add(item.id);
          if (seen.size > 256) seen.delete(seen.values().next().value!);
          bridge.open(item);
        }
      } while (alive && again);
    } catch { /* A missed wake stays in the native queue until the next mount or response. */ }
    finally { busy = false; }
  };
  const stop = await bridge.listen(() => { void drain(); });
  void drain(); // Includes a banner click which cold-launched the app before this listener mounted.
  return () => { alive = false; stop(); };
}
