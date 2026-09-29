import { useCallback, useEffect, useRef, useState } from 'react';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import type { WorkspaceModel } from '../ui/types';
import { onTourRequest, shouldOfferTour, tourSeenKey, welcomeFinished } from './tourRequests';

/** A beat for the home to land before the tour rises over it, so it reads as arriving, not as a flash. */
const SETTLE = 650;

export type TourOpening = { replay: boolean } | null;

/** When the tour is up, and whether it was asked for again or is the first run. */
export function useFirstRunTour(workspace: WorkspaceModel, onPrepare: () => void) {
  const [open, setOpen] = useState<TourOpening>(null);
  const status = workspace.onboarding.status;
  const email = workspace.account?.email ?? null;
  const offered = useRef<string | null>(null);
  const prepare = useRef(onPrepare);
  prepare.current = onPrepare;

  useEffect(() => {
    const base = { cameThroughWelcome: welcomeFinished(), complete: status === 'complete',
      signedIn: Boolean(email), demo: Boolean(workspace.demo), seen: false };
    if (!email || offered.current === email || !shouldOfferTour(base)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void readFlag(tourSeenKey(email))
      .catch(() => null)
      .then((seen) => {
        if (!active || !shouldOfferTour({ ...base, seen: Boolean(seen) })) return;
        offered.current = email;
        timer = setTimeout(() => { prepare.current(); setOpen({ replay: false }); }, SETTLE);
      });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [email, status, workspace.demo]);

  useEffect(() => onTourRequest(() => { prepare.current(); setOpen({ replay: true }); }), []);
  // Losing the account mid-tour (sign-out elsewhere) takes the tour down with the workspace.
  useEffect(() => {
    if (!email || status !== 'complete') setOpen(null);
  }, [email, status]);

  const close = useCallback(() => {
    setOpen(null);
    if (email) void writeFlag(tourSeenKey(email), new Date().toISOString()).catch(() => {});
  }, [email]);
  return { open, close };
}
