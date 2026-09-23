import { useEffect, useState } from "react";

import { scaffoldDestination, type DestinationState } from "../ipc/scaffold";

/**
 * Whether the folder a new project would land in is free, asked as the name is
 * typed. The build refuses a folder with someone's files in it, and the screen
 * that can do something about that is this one — not the build screen, where
 * the only way out is to start over.
 *
 * `null` while unknown: a name is typed a character at a time, and a warning
 * that blinks on every keystroke is worse than one that arrives a moment late.
 */
export function useDestinationState(path: string): DestinationState | null {
  const [state, setState] = useState<DestinationState | null>(null);

  useEffect(() => {
    if (!path) {
      setState(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void scaffoldDestination(path).then(
        (answer) => {
          if (alive) setState(answer);
        },
        // The build checks again anyway; a check that could not run must not
        // stand between someone and a folder that is perfectly fine.
        () => {
          if (alive) setState(null);
        },
      );
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [path]);

  return state;
}
