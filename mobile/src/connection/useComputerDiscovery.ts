import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createDiscoverySession } from './discoverySession';
import type { DiscoveryUpdate } from './discoveryTypes';
import { localDiscovery } from './localDiscovery';

/** Owns one Bonjour search for the screen that is showing it.
 *
 *  `auto` starts the search as the search screen appears, which is also what
 *  makes iOS present its Local Network consent alert; the screen is only
 *  reached from an explicit action, and nothing scans before it. `elapsed`
 *  drives the live progress read-out and is not a timeout of its own. */
export function useComputerDiscovery({ auto = false }: { auto?: boolean } = {}) {
  const [result, setResult] = useState<DiscoveryUpdate>({ status: 'idle', computers: [], networks: [] });
  const [elapsed, setElapsed] = useState(0);
  const session = useMemo(() => createDiscoverySession(localDiscovery, setResult), []);
  const restart = useRef(() => {});
  restart.current = () => { setElapsed(0); session.start(); };
  useEffect(() => {
    if (auto) restart.current();
    const subscription = AppState.addEventListener('change', state => {
      // iOS becomes inactive for its own consent alert; let that alert finish.
      if (state === 'background') {
        session.stop();
        setResult(previous => ({ ...previous, status: 'finished' }));
      }
    });
    return () => { session.stop(); subscription.remove(); };
  }, [auto, session]);
  useEffect(() => {
    if (result.status !== 'searching') return;
    const timer = setInterval(() => setElapsed(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [result.status]);
  return { ...result, networks: result.networks ?? [], elapsed, available: localDiscovery.available,
    stop: session.stop, start: () => restart.current() };
}
