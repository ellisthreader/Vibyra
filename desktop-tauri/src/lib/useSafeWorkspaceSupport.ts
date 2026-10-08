import { useCallback, useEffect, useState } from "react";

import { safeWorkspaceSupported } from "../ipc/workspace";

export interface SafeWorkspaceSupport {
  /** `null` while the answer is unknown, so a switch never flickers through
   * "unavailable" on its way to the truth. */
  supported: boolean | null;
  /** Ask again — after setting Git up here, for instance. */
  recheck: () => void;
}

/**
 * Whether Safe mode can apply to a project folder, i.e. whether there is a Git
 * repository for it to branch from.
 *
 * Re-asked when the window comes back, because `git init` happens in a
 * terminal next door and the switch must not stay wrong until the app
 * restarts.
 */
export function useSafeWorkspaceSupport(projectRoot: string | null): SafeWorkspaceSupport {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [asked, setAsked] = useState(0);
  const recheck = useCallback(() => setAsked((count) => count + 1), []);

  useEffect(() => {
    if (!projectRoot) {
      setSupported(null);
      return;
    }
    let alive = true;
    // Forget the previous project's answer rather than showing it for this one.
    setSupported(null);
    const check = () => {
      void safeWorkspaceSupported(projectRoot).then(
        (value) => {
          if (alive) setSupported(value);
        },
        // A check that could not run must not disable a working feature: the
        // launch re-checks anyway, and refusing there says more than a grey
        // switch here would.
        () => {
          if (alive) setSupported(true);
        },
      );
    };
    check();
    window.addEventListener("focus", check);
    return () => {
      alive = false;
      window.removeEventListener("focus", check);
    };
  }, [projectRoot, asked]);

  return { supported, recheck };
}
