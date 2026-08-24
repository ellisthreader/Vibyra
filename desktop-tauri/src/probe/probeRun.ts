// Drives the keystroke-latency measurement inside the real renderer.
//
// The question the probe answers is the user's, exactly: with six panes
// streaming agent-style full-screen repaints, how long after a keystroke does
// its echo appear ON SCREEN in the pane being typed into? Crate-level tests
// can time delivery; only this can time the paint.

import { invoke } from "@tauri-apps/api/core";
import type { Terminal } from "@xterm/xterm";

import { createTerminal, setTerminalVisibility, writeTerminal } from "../ipc/terminal";
import { attach } from "../lib/terminalBus";
import type { TermEvent, Visibility } from "../types";
import {
  countMarkers,
  phaseReport,
  resolveEchoes,
  type KeystrokeSample,
} from "./probeStats";

// Multi-byte and absent from shell noise, so stray startup output can never
// be mistaken for an echo.
const MARKER = "§";
const KEY_INTERVAL_MS = 150;
const ECHO_TIMEOUT_MS = 2_000;

// One full-viewport repaint every 50 ms, like an agent TUI streaming tokens.
const TUI_SIM =
  "while :; do printf '\\033[H'; i=0; while [ $i -lt 28 ]; do" +
  " printf '%-90s\\n' \"L$i abcdefghijklmnopqrstuvwxyz 0123456789\";" +
  " i=$((i+1)); done; sleep 0.05; done\n";

function report(line: string): Promise<void> {
  return invoke("probe_report", { line });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ProbePanes {
  focusedId: number;
  focusedTerm: Terminal;
  noisyIds: number[];
}

export async function spawnProbePanes(
  spawn: (index: number) => Promise<{ id: number; term: Terminal }>,
): Promise<ProbePanes> {
  const noisyIds: number[] = [];
  for (let index = 0; index < 6; index += 1) {
    const { id } = await spawn(index);
    await writeTerminal(id, TUI_SIM);
    noisyIds.push(id);
  }
  const focused = await spawn(6);
  // cat: the echo under test is the pty's own, with no prompt redrawing.
  await writeTerminal(focused.id, "exec cat\n");
  return { focusedId: focused.id, focusedTerm: focused.term, noisyIds };
}

export function createProbeTerminal(
  options: { rows: number; cols: number },
): Promise<{ id: number }> {
  return createTerminal({ agentId: "shell", rows: options.rows, cols: options.cols });
}

/** One measured phase: type `keys` marker keys, timing each stage. */
async function runPhase(phase: string, panes: ProbePanes, keys: number): Promise<void> {
  const pending: KeystrokeSample[] = [];
  const samples: KeystrokeSample[] = [];
  const frameGaps: number[] = [];

  let framing = true;
  let lastFrame = performance.now();
  const frameLoop = (now: number) => {
    frameGaps.push(now - lastFrame);
    lastFrame = now;
    if (framing) requestAnimationFrame(frameLoop);
  };
  requestAnimationFrame(frameLoop);

  // Replaces the registry's handler for the focused pane: same term.write,
  // plus timestamps. The noisy panes keep their normal rendering path.
  attach(panes.focusedId, (event: TermEvent) => {
    if (event.type !== "output") return;
    const now = performance.now();
    const resolved = resolveEchoes(pending, countMarkers(event.data, MARKER), now);
    panes.focusedTerm.write(event.data, () => {
      const parsed = performance.now();
      for (const sample of resolved) sample.parse = parsed;
      requestAnimationFrame((painted) => {
        for (const sample of resolved) sample.paint = painted;
      });
    });
  });

  for (let key = 0; key < keys; key += 1) {
    const sample: KeystrokeSample = {
      sent: performance.now(),
      event: null,
      parse: null,
      paint: null,
    };
    pending.push(sample);
    samples.push(sample);
    panes.focusedTerm.input(MARKER, true);
    await wait(KEY_INTERVAL_MS);
  }
  await wait(ECHO_TIMEOUT_MS);
  framing = false;

  const dropped = samples.filter((sample) => sample.paint === null).length;
  await report(JSON.stringify(phaseReport(phase, samples, dropped, frameGaps.slice(1))));
}

async function setAll(panes: ProbePanes, noisy: Visibility): Promise<void> {
  await setTerminalVisibility(panes.focusedId, "visible");
  for (const id of panes.noisyIds) {
    await setTerminalVisibility(id, noisy);
  }
}

/** The whole run: the harness-selected phases on this binary's flusher. */
export async function runProbe(panes: ProbePanes): Promise<void> {
  const [phaseList, keys] = await invoke<[string, number]>("probe_config");
  await report("PROBE-START");
  // Let shells start, sims settle, and startup output drain out of the way.
  await wait(3_000);

  for (const phase of phaseList.split(",")) {
    await setAll(panes, phase === "focus-paced" ? "background" : "visible");
    await wait(1_000);
    await report(`PHASE ${phase}`);
    await runPhase(phase, panes, keys);
  }

  await report("PROBE-COMPLETE");
}
