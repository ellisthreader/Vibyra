import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [result, setResult] = useState<DiscoveryUpdate>({
    status: 'idle',
    computers: [],
    networks: [],
  });
  const [elapsed, setElapsed] = useState(0);
  const session = useMemo(() => createDiscoverySession(localDiscovery, setResult), []);
  const wanted = useRef(false);
  const backgrounded = useRef(false);
  const restart = useRef(() => {});
  restart.current = () => {
    wanted.current = true;
    setElapsed(0);
    session.start();
  };
  const stop = useCallback(() => {
    wanted.current = false;
    session.stop();
  }, [session]);
  useEffect(() => {
    if (auto) restart.current();
    const subscription = AppState.addEventListener('change', (state) => {
      // iOS becomes inactive for its own consent alert; let that alert finish.
      if (state === 'background') {
        backgrounded.current = true;
        session.stop();
        setResult((previous) => ({
          ...previous,
          status: previous.status === 'denied' ? 'denied' : 'finished',
        }));
      } else if (state === 'active' && backgrounded.current) {
        backgrounded.current = false;
        if (wanted.current) restart.current();
      }
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [auto, session, stop]);
  useEffect(() => {
    if (result.status !== 'searching') return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [result.status]);
  return {
    ...result,
    networks: result.networks ?? [],
    progress: result.progress,
    elapsed,
    available: localDiscovery.available,
    stop,
    start: () => restart.current(),
  };
}
