import type { SyncStatus } from "./cloudSyncClient";
import { agoFromSeconds } from "./cloudSyncState";
import { cloudBytes } from "./cloudOverviewCapacity";
import type { CloudChip, CloudLiveRow, CloudLiveState, CloudOverview, CloudPhase, CloudProjectStatus } from "./cloudOverviewTypes";

const STATES: Record<CloudPhase, CloudLiveState> = {
  unknown: "waiting", running: "running", uploading: "sending", preparing: "sending", waiting_cloud: "sending", applying: "sending",
  waiting_mac: "waiting", mac_paused: "paused", skipped: "stuck", needs_attention: "stuck", saved: "saved", ready: "ready", diverged: "ready",
};
const ORDER: CloudLiveState[] = ["running", "sending", "waiting", "paused", "stuck", "saved", "ready"];
const NEEDS_CLOUD: CloudPhase[] = ["waiting_cloud", "saved", "applying"];
const NEEDS_COMPUTER: CloudPhase[] = ["waiting_cloud", "preparing", "uploading"];
export const cloudMoving = (row: CloudLiveRow) => !row.hold && ["waiting_cloud", "preparing", "uploading", "saved", "applying"].includes(row.phase);
export const cloudReady = (row: CloudLiveRow) => row.phase === "ready" || row.phase === "diverged" || row.phase === "running";
const ago = (iso: string | null | undefined, now: number) => iso && Number.isFinite(Date.parse(iso)) ? agoFromSeconds(Date.parse(iso) / 1000, now) : null;

function cloudPhaseLine(phase: CloudPhase, status: Partial<CloudProjectStatus> = {}, now = Date.now(), computer = "Mac"): string {
  switch (phase) {
    case "unknown": return "Checking this project’s Cloud status…";
    case "running": return "Running in Cloud";
    case "waiting_mac": return `Waiting for your ${computer}`;
    case "mac_paused": return `Paused on your ${computer}`;
    case "waiting_cloud": return "Starting Vibyra Cloud…";
    case "preparing": return `Getting ready on your ${computer}…`;
    case "uploading": return status.total && status.sent !== undefined
      ? `Sending from your ${computer} · ${Math.min(99, Math.floor(status.sent / status.total * 100))}%` : `Sending from your ${computer}…`;
    case "saved": return "Saved · opening in Cloud soon";
    case "applying": return "Opening in Cloud…";
    case "ready": { const when = ago(status.appliedAt ?? status.syncedAt, now); return when ? `Ready · updated ${when}` : "Ready"; }
    case "diverged": return "Ready · Cloud has its own edits";
    case "skipped": return status.code === "too_large"
      ? status.bytes && status.limitBytes ? `Too big for Cloud · ${cloudBytes(status.bytes)} of ${cloudBytes(status.limitBytes)}` : "Too big for Cloud"
      : status.message ?? `Not sent — check it on your ${computer}`;
    case "needs_attention": return status.message ?? `Couldn’t sync — check it on your ${computer}`;
  }
}

/** Matches only stable keys. A local upload receipt never upgrades an un-applied server copy to Ready. */
export function overviewRows(overview: CloudOverview, sync: SyncStatus, now = Date.now(), computer = "Mac"): CloudLiveRow[] {
  const chip = overview.computer?.chip ?? null;
  const fresh = overview.macs?.some(m => m.state !== "offline" && m.lastSeenAt && now - Date.parse(m.lastSeenAt) < 180_000);
  const result: CloudLiveRow[] = overview.projects.filter(p => p.allowed).map(p => {
    const local = sync.projects.find(s => s.projectKey === p.projectKey);
    const legacy: CloudPhase = p.cloud.state === "synced" ? "ready" : p.cloud.state === "diverged" ? "diverged"
      : p.cloud.state === "skipped" ? "skipped" : p.cloud.state === "error" ? "needs_attention" : "waiting_mac";
    const phase = p.cloud.status?.phase ?? legacy;
    const status = { syncedAt: p.cloud.syncedAt ?? undefined, ...p.cloud.status };
    const row: CloudLiveRow = { key: p.projectKey, projectKey: p.projectKey, name: p.name, localId: local?.id ?? null,
      phase, state: STATES[phase], line: cloudPhaseLine(phase, status, now, computer),
      repair: phase === "needs_attention" && p.cloud.status !== null, changes: local?.pendingChange?.files.length ?? 0,
      ...(phase === "uploading" && status.sent !== undefined && status.total !== undefined ? { upload: { sent: status.sent, total: status.total } } : {}),
      ...(phase === "saved" && status.syncedAt ? { since: status.syncedAt } : {}),
    };
    const up = chip === "running" || chip === "starting";
    const grace = phase === "saved" && overview.autoWake && chip === "asleep" && (!row.since || now - Date.parse(row.since) < 90_000);
    if (NEEDS_CLOUD.includes(phase) && !up && !grace) {
      row.hold = chip === "error" ? "cloud_failed" : "cloud"; row.state = "waiting";
      row.line = chip === "error" ? "Vibyra Cloud couldn’t start" : "Vibyra Cloud isn’t running";
    } else if (NEEDS_COMPUTER.includes(phase) && local && sync.paused) {
      row.hold = "computer_paused"; row.state = "paused"; row.line = `Paused on your ${computer}`;
    } else if (NEEDS_COMPUTER.includes(phase) && !local && overview.macs !== undefined && !fresh) {
      row.hold = "computer_away"; row.state = "waiting"; row.line = `Waiting for your ${computer}`;
    }
    return row;
  });
  for (const local of sync.projects) {
    if (!local.enabled || local.state === "notChosen" || local.state === "off" || overview.projects.some(p => p.projectKey === local.projectKey)) continue;
    result.push({ key: `local:${local.id}`, projectKey: local.projectKey ?? null, localId: local.id, name: local.name,
      phase: "unknown", state: "waiting", line: "Checking this project’s Cloud status…", repair: false, changes: local.pendingChange?.files.length ?? 0 });
  }
  return result.sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || a.name.localeCompare(b.name));
}

export function cloudSentence(rows: CloudLiveRow[], chip: CloudChip | null, computer = "Mac"): string {
  if (chip === "stopping") return "Vibyra Cloud is stopping…";
  const running = rows.filter(r => r.phase === "running");
  if (running.length) return running.length === 1 ? `Running ${running[0].name} now` : `Running ${running.length} projects`;
  if (rows.some(cloudMoving)) return "Vibyra Cloud is syncing…";
  if (rows.some(r => r.hold === "cloud_failed")) return "Vibyra Cloud couldn’t start";
  if (rows.some(r => r.hold === "cloud")) return "Vibyra Cloud isn’t running";
  if (rows.some(r => r.phase === "waiting_mac" || r.hold === "computer_away")) return `Waiting for your ${computer}`;
  if (rows.some(r => r.phase === "mac_paused" || r.hold === "computer_paused")) return `Paused on your ${computer}`;
  if (chip === "starting") return "Vibyra Cloud is starting…";
  const stuck = rows.filter(r => r.state === "stuck");
  if (stuck.length) return `${stuck.length === 1 ? stuck[0].name : `${stuck.length} projects`} couldn’t sync`;
  if (chip === "error") return "Vibyra Cloud needs attention";
  if (rows.some(r => r.phase === "unknown")) return "Checking Vibyra Cloud…";
  if (!rows.length) return "Nothing in Cloud yet";
  return `${rows.length} ${rows.length === 1 ? "project" : "projects"} ready`;
}
export function cloudDetail(rows: CloudLiveRow[], chip: CloudChip | null, paused: boolean, computer = "Mac"): string | null {
  if (rows.some(r => r.hold === "cloud_failed")) return "Its last start didn’t finish · try again";
  if (rows.some(r => r.hold === "cloud")) return "Start it to finish syncing";
  if (paused || rows.some(r => r.hold === "computer_paused" || r.phase === "mac_paused")) return "Resume syncing in This computer below";
  if (rows.some(r => r.hold === "computer_away" || r.phase === "waiting_mac")) return `Keep Vibyra open on your ${computer}`;
  if (rows.some(r => r.phase === "unknown")) return "Waiting for an update from Cloud";
  return !rows.length || chip === "starting" || chip === "stopping" ? null : chip === "running" ? "Cloud is running" : "Cloud is asleep";
}
