import { useEffect, useRef } from "react";

import { invoke } from "@tauri-apps/api/core";

import { initTerminalFont } from "../lib/terminalFont";
import { mountTerminal } from "../lib/terminalRegistry";
import { useSettingsStore } from "../state/settingsStore";
import { createProbeTerminal, runProbe, spawnProbePanes } from "./probeRun";

/**
 * Replaces the app entirely when the latency probe is compiled in and asked
 * for: no auth, no workspace, no stores beyond settings — just seven real
 * terminals on the real renderer and the driver typing into one of them.
 */
export function ProbeScreen() {
  const gridRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || started.current) return;
    started.current = true;

    void (async () => {
      try {
        await initTerminalFont();
        await useSettingsStore.getState().load();
        const settings = useSettingsStore.getState().settings;
        if (!settings) throw new Error("settings failed to load");

        const panes = await spawnProbePanes(async (index) => {
          const host = document.createElement("div");
          host.style.cssText = "min-width:0;min-height:0;overflow:hidden;";
          grid.appendChild(host);
          const info = await createProbeTerminal({ rows: 28, cols: 90 });
          const entry = mountTerminal(info.id, settings, host, index !== 6);
          return { id: info.id, term: entry.term };
        });
        await runProbe(panes);
      } catch (error) {
        await invoke("probe_report", { line: `PROBE-FAILED ${String(error)}` }).catch(() => {});
      }
    })();
  }, []);

  return (
    <div
      ref={gridRef}
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        gap: "4px",
        background: "#101010",
      }}
    />
  );
}
