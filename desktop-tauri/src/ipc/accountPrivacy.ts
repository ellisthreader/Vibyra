import { invoke } from "@tauri-apps/api/core";

/** Where the account's newest "Download my data" export stands. The signed link itself never reaches the renderer. */
export interface ExportState {
  status: "none" | "queued" | "building" | "ready" | "failed" | "expired";
  canRequest: boolean;
  nextAllowedAt: string | null;
  hasLink: boolean;
  linkExpiresInMinutes: number | null;
  bytes: number | null;
}

/** "Keep run history for": the person's choices within the server's maximum, in days. `days` is what applies now. */
export interface RetentionState {
  maxDays: number | null;
  serverDays: number | null;
  days: number | null;
  choices: number[];
}

/** `null` from any read means the server does not offer it (an older server, or switched off): draw nothing. */
export async function accountExportStatus(): Promise<ExportState | null> {
  return ((await invoke("account_export_status")) as ExportState | null) ?? null;
}

export async function accountExportRequest(): Promise<ExportState | null> {
  return ((await invoke("account_export_request")) as ExportState | null) ?? null;
}

/** Opens the ready archive in the browser. Native fetches a fresh short-lived link and checks it first. */
export async function accountExportOpen(): Promise<void> {
  await invoke("account_export_open");
}

export async function accountRetention(): Promise<RetentionState | null> {
  return ((await invoke("account_retention")) as RetentionState | null) ?? null;
}

/** `null` returns to the server's standard. */
export async function accountRetentionSet(days: number | null): Promise<RetentionState | null> {
  return ((await invoke("account_retention_set", { days })) as RetentionState | null) ?? null;
}
