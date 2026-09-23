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
  resumeCwd?: string | null;
  rows?: number;
  cols?: number;
  model?: string | null;
  permissionMode?: "standard" | "full";
  reasoningEffort?: string | null;
  workspaceMode?: "safe" | "shared";
  safeSnapshotFingerprint?: string;
  /** Continue the agent's previous conversation instead of starting one. */
  resume?: boolean;
  /** The conversation this pane owns: pinned at launch, named on resume. */
  agentSessionId?: string | null;
  /** Which provider account to run as; null means the first one. */
  accountId?: string | null;
}

export async function createTerminal(options: CreateTerminalOptions): Promise<SessionInfo> {
  const { channel, bind } = sessionChannel();
  (window as any).__dbg?.(`invoke create_terminal ${JSON.stringify({agentId: options.agentId, resume: options.resume, sid: options.agentSessionId, acct: options.accountId, cwd: options.cwd, rcwd: options.resumeCwd})}`);
  const info = await invoke<SessionInfo>("create_terminal", {
    onEvent: channel,
    request: {
      agentId: options.agentId,
      cwd: options.cwd ?? null,
      resumeCwd: options.resumeCwd ?? null,
      rows: options.rows ?? null,
      cols: options.cols ?? null,
      model: options.model ?? null,
      permissionMode: options.permissionMode ?? "standard",
      reasoningEffort: options.reasoningEffort ?? null,
      workspaceMode: options.workspaceMode ?? "shared",
      safeSnapshotFingerprint: options.safeSnapshotFingerprint ?? null,
      accountId: options.accountId ?? null,
      resume: options.resume ?? false,
      agentSessionId: options.agentSessionId ?? null,
    },
  });
  (window as any).__dbg?.(`create_terminal returned ${JSON.stringify(info)}`);
  bind(info.id);
  (window as any).__dbg?.(`bound ${info.id}`);
  return info;
}

/**
 * Whether the agent can still find the conversation `sessionId` names.
 *
 * Asked before a resume, because `claude --resume <id>` exits 1 on an id it
 * cannot find rather than opening a fresh chat — which is exactly what a pane
 * that was opened, left empty and closed has. See `relaunchContinuity`.
 */
export function agentConversationResumable(
  agentId: string,
  sessionId: string,
  accountId: string | null,
): Promise<boolean> {
  return invoke<boolean>("agent_conversation_resumable", { agentId, sessionId, accountId });
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

/** Flow control: asks Rust to hold a session's output while its view catches up. */
export function holdTerminalOutput(id: number, hold: boolean): Promise<void> {
  return invoke("hold_terminal_output", { id, hold });
}

export function removeTerminal(id: number): Promise<void> {
    return invoke("remove_terminal", { id });
}

/** The whole scrollback ring, or with `maxBytes` only its most recent part. */
export function terminalSnapshot(id: number, maxBytes?: number): Promise<string> {
  return invoke("terminal_snapshot", { id, maxBytes });
}

export function terminalSessionIdentities(panes: { id: number; accountId: string | null }[]): Promise<{ id: number; sessionId: string | null }[]> {
  return invoke("terminal_session_identities", { panes });
}
