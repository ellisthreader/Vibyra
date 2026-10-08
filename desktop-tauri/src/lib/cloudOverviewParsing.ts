import type { CloudCapacity, CloudComputer, CloudHours, CloudOverview, CloudPhase, CloudProjectStatus, CloudProvider, CloudProviderState } from "./cloudOverviewTypes";

type RecordValue = Record<string, unknown>;
const obj = (raw: unknown): RecordValue => raw && typeof raw === "object" && !Array.isArray(raw) ? raw as RecordValue : {};
const text = (raw: unknown): string | null => typeof raw === "string" && raw.trim() ? raw : null;
const num = (raw: unknown): number | undefined => typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
const numberString = (raw: unknown) => num(typeof raw === "string" && raw.trim() ? Number(raw) : raw) ?? 0;
const bool = (raw: unknown) => typeof raw === "boolean" ? raw : null;
const list = (raw: unknown): unknown[] => Array.isArray(raw) ? raw : [];
const PHASES: CloudPhase[] = ["waiting_mac", "mac_paused", "waiting_cloud", "preparing", "uploading", "saved", "applying", "ready", "diverged", "skipped", "needs_attention", "running"];

function parseHours(raw: unknown): CloudHours | null {
  const h = obj(raw);
  return num(h.allowanceSeconds) === undefined ? null : {
    allowanceSeconds: num(h.allowanceSeconds)!, usedSeconds: num(h.usedSeconds) ?? 0,
    resetsAt: text(h.resetsAt), overage: h.overage === "blocked" ? "blocked" : "tokens",
  };
}
function parseCapacity(raw: unknown): CloudCapacity | null {
  const c = obj(raw);
  if (!Object.keys(c).length) return null;
  const storage = obj(c.storage), sessions = obj(c.sessions), computers = obj(c.computers), hours = parseHours(c.hours);
  const result: CloudCapacity = {};
  if (hours) result.hours = hours;
  if (num(storage.limitBytes) !== undefined) result.storage = { usedBytes: num(storage.usedBytes) ?? 0, limitBytes: num(storage.limitBytes)! };
  if (num(sessions.active) !== undefined) result.sessions = { active: num(sessions.active)!, limit: num(sessions.limit) ?? null };
  if (num(computers.used) !== undefined && num(computers.limit) !== undefined) result.computers = { used: num(computers.used)!, limit: num(computers.limit)! };
  for (const key of ["idleStopSeconds", "maxSessionSeconds", "projectLimit"] as const) if (num(c[key]) !== undefined) result[key] = num(c[key]);
  return result;
}
function parseStatus(raw: unknown): CloudProjectStatus | null {
  const s = obj(raw);
  if (!Object.keys(s).length) return null;
  if (!PHASES.includes(s.phase as CloudPhase)) return { phase: "unknown" };
  const result: CloudProjectStatus = { phase: s.phase as CloudPhase };
  for (const key of ["sent", "total", "bytes", "limitBytes"] as const) if (num(s[key]) !== undefined) result[key] = num(s[key]);
  for (const key of ["syncedAt", "appliedAt", "code", "message"] as const) if (text(s[key])) result[key] = text(s[key])!.slice(0, 500);
  return result;
}
function parseComputer(raw: unknown): CloudComputer | null {
  if (!raw || typeof raw !== "object") return null;
  const c = obj(raw), state = text(c.state) ?? "unknown", compute = obj(c.compute);
  const chip = state === "error" ? "error" : state === "stopping" ? "stopping"
    : state === "starting" || state === "running" && c.online !== true ? "starting" : state === "running" ? "running" : "asleep";
  return {
    state, chip, error: text(c.error), sessionsActive: num(c.sessionsActive) ?? 0, hours: parseHours(c.hours),
    projects: list(c.projects).map(obj).filter(p => text(p.name)).map(p => ({ name: text(p.name)!, repo: text(p.repo), branch: text(p.branch) })),
    compute: text(compute.profile) ? {
      profile: text(compute.profile)!, unitsPerHour: numberString(compute.unitsPerHour), committedUnits: numberString(compute.committedUnits),
      sessionBudgetUnits: numberString(compute.sessionBudgetUnits), trialSecondsRemaining: num(compute.trialSecondsRemaining) ?? null,
    } : null,
  };
}

/** Missing/failed envelopes stay errors. They must never become "nothing in Cloud" or signed-out providers. */
export function parseCloudOverview(raw: unknown): CloudOverview {
  const envelope = obj(raw), computerState = obj(envelope.computer), access = obj(envelope.access);
  if (typeof computerState.enabled !== "boolean" || typeof computerState.connected !== "boolean" || !Array.isArray(access.projects)) {
    throw new Error("Vibyra Cloud returned an incomplete update. Try again.");
  }
  const machine = obj(computerState.computer), login = obj(machine.login), providerData = obj(access.providers), integrationData = obj(access.integrations);
  const providers = Object.fromEntries((["claude", "codex", "github"] as CloudProvider[]).map(id => {
    const p = obj(id === "github" ? integrationData.github : providerData[id]), own = obj(p.cloudLogin);
    const view: CloudProviderState = {
      enabled: bool(p.enabled), signedIn: id === "github" ? bool(p.connected) : bool(login[id]),
      pending: own.pending === true, appliedAt: text(own.appliedAt),
    };
    return [id, view];
  })) as Record<CloudProvider, CloudProviderState>;
  const projects = list(access.projects).map(obj).filter(p => text(p.projectKey) && text(p.name)).map(p => {
    const cloud = obj(p.cloud);
    return { projectKey: text(p.projectKey)!, name: text(p.name)!, allowed: p.allowed === true,
      cloud: { state: text(cloud.state), syncedAt: text(cloud.syncedAt), status: parseStatus(cloud.status) } };
  });
  return {
    enabled: computerState.enabled, connected: computerState.connected, consentVersion: num(computerState.consentVersion) ?? 0,
    computer: parseComputer(computerState.computer), projects, providers,
    capacity: parseCapacity(access.capacity) ?? parseCapacity(computerState.capacity),
    ...(Array.isArray(access.macs) ? { macs: access.macs.map(obj).filter(m => text(m.id)).map(m => ({
      id: text(m.id)!, state: text(m.state), lastSeenAt: text(m.lastSeenAt),
    })) } : {}),
    autoWake: access.autoWake === true || projects.some(p => p.cloud.status !== null),
  };
}
