import type { CloudCapacity, CloudComputer, CloudHours, CloudOverview } from "./cloudOverviewTypes";

const decimal = (value: number) => value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
export function cloudBytes(bytes: number): string {
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes), unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${unit ? decimal(value) : Math.round(value)} ${units[unit]}`;
}
export const cloudStorage = (storage: NonNullable<CloudCapacity["storage"]>) => `${cloudBytes(storage.usedBytes)} of ${cloudBytes(storage.limitBytes)}`;
export function cloudHours(hours: CloudHours): string {
  if (hours.allowanceSeconds <= 0) return "No included hours on your plan yet";
  const left = decimal(Math.max(0, hours.allowanceSeconds - hours.usedSeconds) / 3600);
  const reset = hours.resetsAt && Number.isFinite(Date.parse(hours.resetsAt))
    ? new Date(hours.resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : null;
  return `${left} h of ${decimal(hours.allowanceSeconds / 3600)} h left${reset ? ` · resets ${reset}` : ""}`;
}
export function cloudCapacityLine(capacity: CloudCapacity | null, computer: CloudComputer | null): string | null {
  const hours = capacity?.hours ?? computer?.hours;
  const first = capacity?.storage ? cloudStorage(capacity.storage) : hours ? cloudHours(hours) : null;
  const idle = capacity?.idleStopSeconds ? `stops after ${Math.round(capacity.idleStopSeconds / 60)} min idle` : null;
  return [first, idle].filter(Boolean).join(" · ") || null;
}
export function cloudAccountsLine(overview: CloudOverview): string {
  const signed = (["claude", "codex"] as const).filter(id => overview.providers[id].signedIn === true);
  if (signed.length) return signed.map(id => `${id === "claude" ? "Claude" : "Codex"} ✓`).join(" · ");
  if (Object.values(overview.providers).some(p => p.pending)) return "Signing in…";
  return [overview.providers.claude, overview.providers.codex].every(p => p.signedIn === null) ? "Sign-in status unavailable" : "Not signed in";
}
