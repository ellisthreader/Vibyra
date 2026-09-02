import { Channel, invoke } from "@tauri-apps/api/core";

import type { ScaffoldRequest } from "../lib/projectTemplateCommand";
import type { ToolId } from "../lib/projectTemplateTypes";

export type ScaffoldEvent =
  | { type: "step"; index: number; total: number; label: string }
  | { type: "line"; data: string };

export interface ScaffoldOutcome {
  ok: boolean;
  message: string | null;
  /** The step went silent — offer the user a terminal instead. */
  stalled: boolean;
}

/** Which toolchains are on PATH. Asked once when the dialog opens. */
export function scaffoldPreflight(tools: ToolId[]): Promise<Record<string, boolean>> {
  return invoke("scaffold_preflight", { tools });
}

export function scaffoldRun(
  runId: string,
  plan: ScaffoldRequest,
  onEvent: (event: ScaffoldEvent) => void,
): Promise<ScaffoldOutcome> {
  const channel = new Channel<ScaffoldEvent>();
  channel.onmessage = onEvent;
  return invoke("scaffold_run", { runId, plan, onEvent: channel });
}

export function scaffoldCancel(runId: string): Promise<void> {
  return invoke("scaffold_cancel", { runId });
}
