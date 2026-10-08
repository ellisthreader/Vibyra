/** Cloud's public state. Secrets stay in the native login service. */
export type CloudProvider = "claude" | "codex" | "github";
export type CloudPhase = "unknown" | "waiting_mac" | "mac_paused" | "waiting_cloud" | "preparing" | "uploading" | "saved" | "applying" | "ready" | "diverged" | "skipped" | "needs_attention" | "running";
export type CloudChip = "starting" | "running" | "asleep" | "stopping" | "error";
export type CloudLiveState = "running" | "sending" | "waiting" | "paused" | "stuck" | "saved" | "ready";
export type CloudHold = "cloud" | "cloud_failed" | "computer_paused" | "computer_away";

export interface CloudProjectStatus {
  phase: CloudPhase; sent?: number; total?: number; syncedAt?: string; appliedAt?: string;
  code?: string; message?: string; bytes?: number; limitBytes?: number;
}
export interface CloudAccessProject {
  projectKey: string; name: string; allowed: boolean;
  cloud: { state: string | null; syncedAt: string | null; status: CloudProjectStatus | null };
}
export interface CloudHours { allowanceSeconds: number; usedSeconds: number; resetsAt: string | null; overage: "tokens" | "blocked" }
export interface CloudCapacity {
  hours?: CloudHours; storage?: { usedBytes: number; limitBytes: number };
  sessions?: { active: number; limit: number | null }; computers?: { used: number; limit: number };
  idleStopSeconds?: number; maxSessionSeconds?: number; projectLimit?: number;
}
export interface CloudProviderState { enabled: boolean | null; signedIn: boolean | null; pending: boolean; appliedAt: string | null }
export interface CloudComputer {
  state: string; chip: CloudChip; error: string | null; sessionsActive: number;
  hours: CloudHours | null; projects: { name: string; repo: string | null; branch: string | null }[];
  compute: { profile: string; unitsPerHour: number; committedUnits: number; sessionBudgetUnits: number; trialSecondsRemaining: number | null } | null;
}
export interface CloudMacSeen { id: string; state: string | null; lastSeenAt: string | null }
export interface CloudOverview {
  enabled: boolean; connected: boolean; consentVersion: number; computer: CloudComputer | null;
  projects: CloudAccessProject[]; providers: Record<CloudProvider, CloudProviderState>;
  capacity: CloudCapacity | null; macs?: CloudMacSeen[]; autoWake: boolean;
}
export interface CloudLiveRow {
  key: string; projectKey: string | null; localId: string | null; name: string;
  phase: CloudPhase; state: CloudLiveState; line: string; repair: boolean; changes: number;
  upload?: { sent: number; total: number }; since?: string; hold?: CloudHold;
}
export interface CloudProgress { progress: number; moving: boolean; slow: boolean; left: number | null; flightAt: number | null }
export interface CloudLoginView {
  id: "claude" | "codex";
  state: "unknown" | "notInstalled" | "waitingForCloud" | "ready" | "allowing" | "sending" | "done" | "error" | "disabled";
  error: string | null;
}
