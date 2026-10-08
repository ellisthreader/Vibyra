/** Typed client for the cloud sync commands. The transport is injected so the client is testable
 * without Tauri; the renderer sees state and file paths only, never a token or a key. */
import type { Invoke } from "./cloudComputerClient";

export type SyncGate = "starting" | "signedOut" | "off" | "needsConsent" | "unavailable" | "ready";
/** `notChosen`: switched on here but not ticked for Vibyra Cloud (on the iPhone or the project menu). */
export type ProjectSyncState = "off" | "notChosen" | "syncing" | "pending" | "waiting" | "synced" | "diverged" | "skipped" | "error";
export type FileStatus = "added" | "modified" | "deleted";

export interface PendingChange { seq: number; files: { path: string; status: FileStatus; mode: string }[] }
export interface SyncProject {
  id: string; name: string; projectKey?: string; enabled: boolean; state: ProjectSyncState;
  /** Unix seconds of the last upload. */
  syncedAt: number | null;
  heldBackCount: number; heldBack: { path: string; reason: string }[];
  lastError: string | null; skippedReason: string | null; retryAt: number | null;
  pendingChange: PendingChange | null;
  /** Conversations Vibyra Cloud continued and sent back, newest first; absent from an older app build. */
  returned?: ReturnedSession[];
  /** The newest `cloudAt` the notice was already seen for. */
  returnedSeenAt?: number;
}
/** A conversation Vibyra Cloud continued: the provider's own id, and when the cloud last added to it (unix seconds). */
export interface ReturnedSession { provider: string; id: string; cloudAt: number }
export type CodexLoginState = "off" | "blockedFromPhone" | "waitingToStart" | "sending" | "sent" | "notSignedIn" | "waitingForCloud" | "error";
/** The Codex login carry-over row: the switch and one state word. Never the login itself. */
export interface CodexLoginStatus { on: boolean; state: CodexLoginState; sentAt: number | null; error: string | null }
export interface SyncStatus {
  enabled: boolean; consentVersion: number; requiredConsentVersion: number; needsConsent: boolean;
  /** Never agreed on this Mac; the account agreed on the iPhone ("Connect to cloud"), which counts as consent here. */
  consentFromPhone?: boolean;
  /** "Pause syncing on this Mac": projects stay ticked on the account while this Mac stops sending. */
  paused: boolean;
  /** The account agreed to Vibyra Cloud (on this Mac or the iPhone) under the current terms. */
  accountConnected: boolean;
  includeConversations: boolean; includeEnv: boolean; autoApplySafe: boolean;
  gate: SyncGate; message: string | null;
  lastSyncedAt: number | null; heldBackTotal: number; pendingFilesTotal: number;
  codexLogin: CodexLoginStatus;
  projects: SyncProject[];
}
export interface SyncOptionsPatch { enabled?: boolean; includeConversations?: boolean; includeEnv?: boolean; autoApplySafe?: boolean }

export interface ChangeReview {
  seq: number; changes: string[]; conflicts: string[]; digest: string;
  unapplied: { path: string; reason: string }[];
}
export interface ChangeApplied { applied: string[]; conflicts: string[]; backup: string; unapplied: { path: string; reason: string }[] }
export interface FileVersion { missing?: boolean; sha256?: string; executable?: boolean; bytes?: number; binary?: boolean; text?: string; truncated?: boolean }
export interface FileReviewData { path: string; base: FileVersion; local: FileVersion; cloud: FileVersion }

export function createCloudSyncClient(invoke: Invoke) {
  return {
    status: () => invoke<SyncStatus>("cloud_sync_status"),
    setOptions: (options: SyncOptionsPatch) => invoke<SyncStatus>("cloud_sync_set_options", { options }),
    /** "Keep projects ready for your iPhone": agrees to Vibyra Cloud from this Mac with the picked projects. */
    connectMac: (projects: { id: string; name: string }[], include: { includeConversations: boolean; includeEnv: boolean; consentVersion: number; accounts: Partial<Record<"claude" | "codex" | "github", boolean>> }) =>
      invoke<SyncStatus>("cloud_sync_connect_mac", { projects, ...include }),
    setProject: (projectId: string, enabled: boolean) => invoke<SyncStatus>("cloud_sync_set_project", { projectId, enabled }),
    /** Stops (or resumes) sending from this Mac; ticks on the account are untouched. */
    setPaused: (paused: boolean) => invoke<SyncStatus>("cloud_sync_set_paused", { paused }),
    /** The "conversations continued in Vibyra Cloud" notice was seen for this project. */
    returnedSeen: (projectId: string) => invoke<SyncStatus>("cloud_sync_returned_seen", { projectId }),
    syncNow: (projectId?: string) => invoke<void>("cloud_sync_now", { projectId: projectId ?? null }),
    changeReview: (projectId: string) => invoke<ChangeReview | null>("cloud_sync_change_review", { projectId }),
    changeFile: (projectId: string, path: string) => invoke<FileReviewData>("cloud_sync_change_file", { projectId, path }),
    /** Never writes without `confirmed`; the digest ties the write to the reviewed list. */
    changeApply: (projectId: string, review: Pick<ChangeReview, "seq" | "digest">) =>
      invoke<ChangeApplied>("cloud_sync_change_apply", { projectId, seq: review.seq, digest: review.digest, confirmed: true }),
    changeDismiss: (projectId: string, seq: number) => invoke<SyncStatus>("cloud_sync_change_dismiss", { projectId, seq }),
  };
}
export type CloudSyncClient = ReturnType<typeof createCloudSyncClient>;
