import { Channel, invoke } from "@tauri-apps/api/core";
import { dispatch } from "../lib/terminalBus";
import { nativeTerminalVisibility } from "../lib/terminalVisibility";
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
  /** Continue the agent's previous conversation instead of starting one. */
  resume?: boolean;
  /** The conversation this pane owns: pinned at launch, named on resume. */
  agentSessionId?: string | null;
  /** Which provider account to run as; null means the first one. */
  accountId?: string | null;
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
      accountId: options.accountId ?? null,
      resume: options.resume ?? false,
      agentSessionId: options.agentSessionId ?? null,
    },
  });
  bind(info.id);
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

/**
 * Copies a conversation into another account's transcripts so it can be
 * resumed there, answering whether it arrived.
 *
 * Asked before a pane changes account: the new login has never seen the chat
 * the pane is in the middle of, and both CLIs treat an id they cannot resolve
 * as fatal. `false` is not a failure — a pane with nothing said in it has
 * nothing to carry — it just means the relaunch starts clean.
 */
export function carryAgentConversation(
  agentId: string,
  sessionId: string,
  fromAccount: string | null,
  toAccount: string | null,
): Promise<boolean> {
  return invoke<boolean>("carry_agent_conversation", {
    agentId,
    sessionId,
    fromAccount,
    toAccount,
  });
}

/**
 * The prompt this pane's conversation opened with, from the agent's own
 * transcript. `null` when the agent keeps none Vibyra can read, `""` when it
 * keeps one the user has not written to yet.
 */
export function agentChatPrompt(id: number): Promise<string | null> {
  return invoke<string | null>("agent_chat_prompt", { id });
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

/**
 * Posts input the instant it is typed and never waits for the reply.
 *
 * Byte order is guaranteed on the native side: `write_terminal` is a
 * synchronous command, so Tauri runs it inline on the thread that receives IPC
 * messages rather than scheduling it on the async runtime, and WebKit delivers
 * those messages in the order this function posted them.
 *
 * Do not reintroduce a promise-chained queue here. Awaiting the previous
 * keystroke's response before sending the next one couples typing to the
 * renderer's paint loop — the reply callback lands behind whatever xterm is
 * drawing — and the pane then permanently shows the key typed before last.
 *
 * The ordered-postMessage guarantee also depends on the window CSP keeping
 * Tauri's `ipc://` custom protocol blocked (fetch-based, unordered). See
 * tests/ipcOrdering.test.mjs before touching connect-src.
 */
export function writeTerminal(id: number, data: string): Promise<void> {
  return invoke("write_terminal", { id, data });
}

/**
 * The last chunk Rust delivered for `id` has been drawn, which releases the
 * next one. Sent once per painted frame by `terminalDeliveryAck`; Rust's
 * `paint_timeout` covers a report that never comes.
 */
export function terminalPainted(id: number): Promise<void> {
  return invoke("terminal_painted", { id });
}

export function resizeTerminal(id: number, rows: number, cols: number): Promise<void> {
  return invoke("resize_terminal", { id, rows, cols });
}

export function setTerminalVisibility(id: number, visibility: Visibility): Promise<void> {
  return invoke("set_terminal_visibility", {
    id,
    visibility: nativeTerminalVisibility(visibility),
  });
}

export function terminalSnapshot(id: number): Promise<string> {
  return invoke<string>("terminal_snapshot", { id });
}

export function removeTerminal(id: number): Promise<void> {
  return invoke("remove_terminal", { id });
}
