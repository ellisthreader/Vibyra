import { type CSSProperties, type ReactNode, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
/** Move only the host element: React, xterm, drafts and presentation PTYs stay mounted. */
export function AdaptivePane({ target, hidden, placement, children }: { target: HTMLElement | null; hidden: boolean; focused: boolean; placement?: CSSProperties; children: ReactNode }) {
  const [host] = useState(() => { const element = document.createElement('div'); element.className = 'adaptive-pane-host'; return element; });
  useLayoutEffect(() => {
    if (!target) return;
    target.appendChild(host);
    return () => { host.remove(); };
  }, [target, host]);
  useLayoutEffect(() => { host.hidden = hidden; }, [host, hidden]);
  useLayoutEffect(() => {
    host.style.gridColumn = String(placement?.gridColumn ?? '');
    host.style.gridRow = String(placement?.gridRow ?? '');
  }, [host, placement?.gridColumn, placement?.gridRow]);
  // Nothing renders until there is a target: the stage's first render has
  // none, and a terminal opened into the detached host could not be measured
  // or fitted, so it would start at xterm's 80x24 default.
  return target ? createPortal(children, host) : null;
}
