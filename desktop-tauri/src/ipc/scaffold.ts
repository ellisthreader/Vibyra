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

/** Whether a project can be built at a path, as the name is typed. */
export type DestinationState = "free" | "used" | "notAFolder";

export function scaffoldDestination(path: string): Promise<DestinationState> {
  return invoke("scaffold_destination", { path });
}

/** A name whose folder is free: only the native side can see the disk. */
export function scaffoldFreeName(parent: string, base: string): Promise<string> {
  return invoke("scaffold_free_name", { parent, base });
}

/** Which toolchains are on PATH. Asked once when the wizard opens. */
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
