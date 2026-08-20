import { Channel, invoke } from "@tauri-apps/api/core";
import { dispatch } from "../lib/terminalBus";
import type { SessionInfo, TermEvent, Visibility } from "../types";

// Each terminal gets its own IPC channel; Rust batches output (~16 ms under
// sustained load, immediate when idle) before it reaches these callbacks.

function sessionChannel(): { channel: Channel<TermEvent>; bind: (id: number) => void } {
  const early: TermEvent[] = [];
  let sessionId: number | null = null;
  const channel = new Channel<TermEvent>();
  channel.onmessage = (event) => {
    if (sessionId === null) {
      early.push(event);
    } else {
      dispatch(sessionId, event);
    }
  };
  return {
    channel,
    bind(id: number) {
      sessionId = id;
      for (const event of early) {
        dispatch(id, event);
      }
      early.length = 0;
    },
  };
}

export interface CreateTerminalOptions {
  agentId: string;
  cwd?: string | null;
  rows?: number;
  cols?: number;
  model?: string | null;
  permissionMode?: "standard" | "full";
  reasoningEffort?: string | null;
  workspaceMode?: "safe" | "shared";
  safeSnapshotFingerprint?: string;
}

export async function createTerminal(options: CreateTerminalOptions): Promise<SessionInfo> {
  const { channel, bind } = sessionChannel();
  const info = await invoke<SessionInfo>("create_terminal", {
    onEvent: channel,
    request: {
      agentId: options.agentId,
      cwd: options.cwd ?? null,
      rows: options.rows ?? null,
      cols: options.cols ?? null,
      model: options.model ?? null,
      permissionMode: options.permissionMode ?? "standard",
      reasoningEffort: options.reasoningEffort ?? null,
      workspaceMode: options.workspaceMode ?? "shared",
      safeSnapshotFingerprint: options.safeSnapshotFingerprint ?? null,
    },
  });
  bind(info.id);
  return info;
}

export async function createSshTerminal(
  target: string,
  dims?: { rows: number; cols: number } | null,
): Promise<SessionInfo> {
  const { channel, bind } = sessionChannel();
  const info = await invoke<SessionInfo>("create_ssh_terminal", {
    onEvent: channel,
    target,
    rows: dims?.rows ?? null,
    cols: dims?.cols ?? null,
  });
  bind(info.id);
  return info;
}

export function writeTerminal(id: number, data: string): Promise<void> {
  return invoke("write_terminal", { id, data });
}

export function resizeTerminal(id: number, rows: number, cols: number): Promise<void> {
  return invoke("resize_terminal", { id, rows, cols });
}

export function setTerminalVisibility(id: number, visibility: Visibility): Promise<void> {
  return invoke("set_terminal_visibility", { id, visibility });
}

export function removeTerminal(id: number): Promise<void> {
  return invoke("remove_terminal", { id });
}
