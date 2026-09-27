import type { DiscoveryUpdate, NearbyComputer } from './discoveryTypes';
import { isConnectable } from './nearbyPairing';

export interface NativeDiscoverySource {
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'onDiscovery', listener: (update: DiscoveryUpdate) => void): { remove(): void };
}

type Probe = (onUpdate: (update: DiscoveryUpdate) => void) => () => void;
const validKey = (key: string | undefined) => Boolean(key && /^[a-f0-9]{64}$/.test(key));

/** Bonjour is first. If it advertises an identity but cannot resolve its
 * endpoint, or advertises nothing at all, ask the local LAN after a grace
 * period. The probe is bounded by startProbeSearch; /identity supplies a
 * candidate, while Noise and computer approval authenticate the connection. */
export function startNativeDiscovery(
  native: NativeDiscoverySource,
  probe: Probe,
  onUpdate: (update: DiscoveryUpdate) => void,
  waitMs = 3000,
) {
  let active = true;
  let latest: DiscoveryUpdate = { status: 'searching', computers: [] };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopProbe: (() => void) | undefined;
  let probeAttempted = false;
  let probeSettled = false;
  let installingProbe = false;
  let cancelAfterInstall = false;
  const recovered = new Map<string, NearbyComputer>();
  const blocked = () => latest.status === 'denied' || latest.status === 'unavailable';
  const announced = () => new Set(latest.computers
    .filter(computer => validKey(computer.hostId)).map(computer => computer.hostId!));
  const needsProbe = () => !blocked()
    && !latest.computers.some(isConnectable)
    && (latest.computers.length === 0 || latest.computers.some(computer =>
      !validKey(computer.hostId) || !recovered.has(computer.hostId!)));
  const emit = () => {
    if (!active) return;
    const computers = latest.computers.map(computer => {
      const address = computer.hostId && recovered.get(computer.hostId);
      return !isConnectable(computer) && address
        ? { ...computer, host: address.host, port: address.port }
        : computer;
    });
    const visibleKeys = new Set(computers.map(computer => computer.hostId));
    for (const computer of recovered.values()) {
      if (!visibleKeys.has(computer.hostId)) computers.push(computer);
    }
    const pending = timer || stopProbe || installingProbe;
    const status = pending && (latest.status === 'finished' || latest.status === 'failed')
      ? 'searching' : probeSettled && latest.status === 'searching' && !computers.some(isConnectable)
        ? 'finished' : latest.status;
    onUpdate({ ...latest, status, computers });
  };
  const cancelProbe = () => {
    if (installingProbe) {
      cancelAfterInstall = true;
      return;
    }
    stopProbe?.();
    stopProbe = undefined;
  };
  const startProbe = () => {
    timer = undefined;
    if (!active || probeAttempted || !needsProbe()) return;
    probeAttempted = true;
    installingProbe = true;
    try {
      stopProbe = probe(update => {
        if (!active || blocked()) return;
        const keys = announced();
        // A partial Bonjour result gives us a key to recover. With no usable
        // TXT identity, a valid /identity response is the only LAN signal.
        for (const computer of update.computers) {
          if (!isConnectable(computer) || computer.id !== computer.hostId) continue;
          if (keys.size && !keys.has(computer.hostId)) continue;
          recovered.set(computer.hostId, computer);
        }
        if (update.status === 'finished' || update.status === 'failed'
          || update.status === 'unavailable') {
          probeSettled = true;
          cancelProbe();
        } else if (latest.computers.length && !needsProbe()) cancelProbe();
        emit();
      });
    } catch {
      probeSettled = true;
    } finally {
      installingProbe = false;
      if (cancelAfterInstall || !needsProbe()) cancelProbe();
      emit();
    }
  };
  const receive = (update: DiscoveryUpdate) => {
    if (!active) return;
    latest = update;
    if (blocked()) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      cancelProbe();
      recovered.clear();
    } else if (!probeAttempted && needsProbe()) {
      if (!timer) timer = setTimeout(startProbe, waitMs);
    } else if (!needsProbe()) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (latest.computers.some(isConnectable)) cancelProbe();
    }
    emit();
  };
  const listener = native.addListener('onDiscovery', receive);
  // A stalled native start may never emit even its initial searching event.
  // Schedule recovery now; any usable Bonjour result or denial cancels it.
  timer = setTimeout(startProbe, waitMs);
  try {
    void native.start().catch(() => {
      if (active && !blocked()) receive({ ...latest, status: 'failed' });
    });
  } catch {
    receive({ ...latest, status: 'failed' });
  }
  return () => {
    active = false;
    if (timer) clearTimeout(timer);
    cancelProbe();
    listener.remove();
    void native.stop().catch(() => {});
  };
}
