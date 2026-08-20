import { useEffect, useRef } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { useSettingsStore } from "../../state/settingsStore";
import { themeFor } from "../../lib/xtermTheme";

/**
 * Replays a restored pane's saved output.
 *
 * Deliberately does **not** use `terminalRegistry`: that wires `onData` to
 * `writeTerminal(id, …)`, and a suspended pane's id names no live session.
 * This terminal owns itself, takes no input, and is disposed on unmount.
 */
export function SuspendedPaneView({ snapshot }: { snapshot: string | null | undefined }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const settings = useSettingsStore.getState().settings;
    if (!host || !settings) return;

    const term = new Terminal({
      disableStdin: true,
      cursorBlink: false,
      cursorStyle: "bar",
      fontSize: settings.fontSize,
      fontFamily: `"JetBrains Mono Variable", ${settings.fontFamily}`,
      scrollback: settings.scrollbackLines,
      theme: themeFor(settings.theme),
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);

    const refit = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width > 80 && rect.height > 60) fit.fit();
    };
    refit();
    // The snapshot is a tail of a raw ANSI stream, so it can begin mid escape
    // sequence. Resetting first stops a severed sequence corrupting the view —
    // the same guard the live resync path uses.
    if (snapshot) {
      term.reset();
      term.write(snapshot, () => term.scrollToBottom());
    }

    const observer = new ResizeObserver(refit);
    observer.observe(host);
    return () => {
      observer.disconnect();
      term.dispose();
    };
  }, [snapshot]);

  return <div ref={hostRef} className="term-view term-view--suspended" aria-label="Saved output" />;
}
