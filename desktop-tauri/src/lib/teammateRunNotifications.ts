import type { NotificationInput } from "../notificationTypes";

// Agent V2 teammate runs reach the Mac through the account's notification inbox
// (`GET /api/notifications/v1/inbox`), the same durable record the iPhone push
// points at. The inbox carries fixed titles and ids only — never task text.
// The decision of what to raise is pure and lives here; polling is in
// useTeammateRunNotifications.

export type TeammateRunKind = "completed" | "approval" | "signin" | "failed" | "progress" | "blocked" | "cancelled";

export interface InboxItem {
  id: string;
  title: string;
  createdAt: string;
  read: boolean;
  actionable: boolean;
  alertDisposition?: 'eligible'|'suppressed'|'deferred';
  destination: {
    source: string;
    runId?: string;
    digestId?:string;
    agentId?: string | null;
    conversationId?: string | null;
    kind?: TeammateRunKind;
  };
}

export interface AlertContext {
  /** Ids already considered. Mutated: every agent_run item is marked seen. */
  seen: Set<string>;
  /** First poll after launch or account switch: remember, never announce. */
  baseline: boolean;
  /** The teammate whose thread is on screen in a focused window, if any. */
  watching: string | null;
  account?: string;
}

const KINDS: Record<TeammateRunKind, Pick<NotificationInput, "category" | "severity">> = {
  completed: { category: "agentDone", severity: "success" },
  approval: { category: "agentAttention", severity: "warning" },
  signin: { category: "agentAttention", severity: "warning" },
  progress:{category:"agentDone",severity:"info"},
  blocked:{category:"agentAttention",severity:"warning"},
  cancelled:{category:"agentDone",severity:"info"},
  failed: { category: "agentFailed", severity: "danger" },
};

/** Retire visible prompts when another device reads them or the run moves on. */
export function settledTeammateKeys(items: InboxItem[]): Set<string> {
  return new Set(items.filter(item => ['agent_run','agent_digest'].includes(item.destination?.source) && (item.read || !item.actionable || item.alertDisposition==='suppressed'))
    .map(item => item.destination.source==='agent_digest'?`teammate-digest:${item.destination.digestId}:${item.id}`:`teammate:${item.destination.runId}:${item.destination.kind}:${item.id}`));
}

export function teammateRunNotification(item: InboxItem, account?: string): NotificationInput | null {
  const d = item.destination;
  if(d?.source==='agent_digest'&&typeof d.digestId==='string'&&/^[a-f0-9-]{36}$/i.test(d.digestId)) return {category:'agentDone',severity:'info',title:item.title,dedupeKey:`teammate-digest:${d.digestId}:${item.id}`,action:{id:'openAgentDigest',label:'Open daily summary',arg:d.digestId,account}};
  const kind = d?.kind;
  if (d?.source !== "agent_run" || !kind || !(kind in KINDS)) return null;
  if (typeof d.agentId !== "string" || typeof d.runId !== "string") return null;
  return {
    ...KINDS[kind],
    title: item.title,
    // One row per run and hook: a second approval on the same run is new news.
    dedupeKey: `teammate:${d.runId}:${kind}:${item.id}`,
    // Needs-you states stay until handled; a finish can fade.
    timeoutMs: ["completed","progress","cancelled"].includes(kind) ? undefined : 0,
    action: { id: "openTeammate", label: "Open conversation", arg: d.agentId, runId: d.runId, ...(account ? { account } : {}) },
  };
}

/** New, still-current teammate alerts worth raising, oldest first. */
export function newTeammateAlerts(items: InboxItem[], context: AlertContext): NotificationInput[] {
  const out: NotificationInput[] = [];
  for (const item of [...items].reverse()) {
    if (!['agent_run','agent_digest'].includes(item.destination?.source) || context.seen.has(item.id)) continue;
    if (!context.baseline && item.alertDisposition==='deferred' && !item.read && item.actionable) continue;
    context.seen.add(item.id);
    // `actionable` is the server's "still true right now": an expired approval
    // or a run that moved on is history, not an alert.
    if (context.baseline || item.read || !item.actionable || item.alertDisposition==='suppressed') continue;
    if (context.watching && item.destination.agentId === context.watching) continue;
    const input = teammateRunNotification(item, context.account);
    if (input) out.push(input);
  }
  return out;
}

/** Teammate runs still waiting on the person (an approval or a sign-in),
 * newest first. Read on the iPhone is not answered, so `read` does not hide
 * an item here; only the server's `actionable` does. */
export function teammateNeeds(items: InboxItem[]): InboxItem[] {
  return items.filter((item) => item.destination?.source === "agent_run" && item.actionable
    && (item.destination.kind === "approval" || item.destination.kind === "signin")
    && typeof item.destination.agentId === "string");
}
