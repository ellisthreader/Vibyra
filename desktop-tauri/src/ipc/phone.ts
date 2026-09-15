import { invoke } from "@tauri-apps/api/core";

export interface PhoneDevice {
  id: string;
  name: string;
}

/** The outbound leg to Vibyra Cloud: `waiting` until this Mac is signed in,
 * then `connecting`, `online`, or `error` with the relay's own words. */
export interface RemoteLeg {
  state: "waiting" | "connecting" | "online" | "error";
  error?: string | null;
  clients: number;
  relay?: string | null;
}

/** Remote access is its own switch under the connection. `leg` is absent
 * while it is off or the connection itself is down. */
export interface RemoteStatus {
  enabled: boolean;
  signedIn: boolean;
  leg?: RemoteLeg | null;
}

/** `enabled` is the switch; `discoverable` is whether the listener is actually
 * up and advertising on this network, which can lag a Wi-Fi change by a beat. */
export interface PhoneStatus {
  enabled: boolean;
  /** Allowed phones may type into terminals, not only watch them. Absent from
   * a backend that predates it, which is the same as off. */
  typing?: boolean;
  discoverable: boolean;
  listening?: boolean;
  discoveryError?: string | null;
  address: string;
  error: string | null;
  devices: PhoneDevice[];
  pending: PhoneDevice[];
  active: string[];
  /** Absent from a backend that predates remote access. */
  remote?: RemoteStatus;
  /** The one folder, if any, this Mac reads out to its phone. Absent from a
   * backend that predates vaults, the same as none chosen. */
  vault?: { path: string | null };
}

export function phoneStatus(): Promise<PhoneStatus> {
  return invoke("phone_status");
}

export function phoneConfigure(enabled: boolean): Promise<PhoneStatus> {
  return invoke("phone_configure", { enabled });
}

export function phoneSetTyping(enabled: boolean): Promise<PhoneStatus> {
  return invoke("phone_set_typing", { enabled });
}

export function phoneSetRemote(enabled: boolean): Promise<PhoneStatus> {
  return invoke("phone_set_remote", { enabled });
}

export function phoneRemoteDisconnectAll(): Promise<PhoneStatus> {
  return invoke("phone_remote_disconnect_all");
}

export function phoneInvite(): Promise<string> {
  return invoke("phone_invite");
}

export function phoneAnswer(id: string, approve: boolean): Promise<void> {
  return invoke("phone_answer", { id, approve });
}

export function phoneRevoke(id: string): Promise<void> {
  return invoke("phone_revoke", { id });
}

/** One of the desktop's projects, as the phone should list it. */
export interface PhoneProject {
  id: string;
  name: string;
  path: string;
}

/** A live pane and the project the desktop is showing it in. */
export interface PhonePane {
  id: number;
  projectId: string;
  title: string;
}

/** Opens a native folder picker; resolves to the status unchanged if cancelled. */
export function phoneVaultChoose(): Promise<PhoneStatus> {
  return invoke("phone_vault_choose");
}

export function phoneVaultClear(): Promise<PhoneStatus> {
  return invoke("phone_vault_clear");
}

/** `chats` names the shared chats the grid is drawing; null while the window
 * cannot say yet, which leaves every chat listed rather than none. */
export function phonePublishWorkspace(
  projects: PhoneProject[],
  panes: PhonePane[],
  chats: string[] | null,
): Promise<void> {
  return invoke("phone_publish_workspace", { projects, panes, chats });
}

/** What a phone asked this window to do: start a terminal in a project, or
 * close one — a pane by its number, a shared chat by its id. */
export type PhoneTerminalRequest =
  | { id: string; action: "create"; projectId: string; kind: "shell" | "codex" | "claude"; title: string; requestId: string }
  | { id: string; action: "close"; paneId?: number; conversationId?: string }
  // A project the phone's wizard has just built on this Mac. Rust made the
  // folder; only this window can put it in the list it publishes.
  | { id: string; action: "adopt"; path: string; name: string };

/** The answer a start gives back — which pane or chat it became. */
export type PhoneTerminalStarted = { paneId: number } | { conversationId: string };

/** The answer an adopt gives back: the project, as the phone's folder list has it. */
export type PhoneProjectOpened = { id: string; name: string; path: string };

export function phoneTerminalRequests(): Promise<PhoneTerminalRequest[]> {
  return invoke("phone_terminal_requests");
}

export function phoneTerminalReply(
  id: string,
  answer: { result?: PhoneTerminalStarted | PhoneProjectOpened | { ok: true }; error?: string },
): Promise<boolean> {
  return invoke("phone_terminal_reply", { id, result: answer.result ?? null, error: answer.error ?? null });
}
