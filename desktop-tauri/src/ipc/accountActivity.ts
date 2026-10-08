import { invoke } from "@tauri-apps/api/core";

/** One line of the account's activity. The native side fixes the route and keeps only these fields. */
export interface ActivityItem {
  id: number;
  title: string;
  createdAt: string;
  detail: string;
}

export interface ActivityPage {
  items: ActivityItem[];
  next: number | null;
}

/** A page of the account's own activity, or `null` when the server does not offer it (older, or switched off). */
export async function accountActivity(before?: number): Promise<ActivityPage | null> {
  const raw = (await invoke("account_activity", { before: before ?? null })) as Partial<ActivityPage> | null;
  if (!raw || !Array.isArray(raw.items)) return null;
  return { items: raw.items, next: typeof raw.next === "number" ? raw.next : null };
}
