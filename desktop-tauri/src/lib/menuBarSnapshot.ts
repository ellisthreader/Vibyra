import type { MenuBarRecent, MenuBarRow, MenuBarSnapshot } from "../ipc/menuBar";
import type { NotificationItem } from "../notificationTypes";
import type { ChatRun } from "../state/agentAttentionStore";
import type { ActivityState } from "./activity";
import type { InboxItem } from "./teammateRunNotifications";

// Pure reduction of what the window already knows into the menu bar snapshot,
// using the same sources as Needs you: waiting terminals, agent chats asking
// for approval, teammate runs and iPhones asking to connect. Kept free of
// stores so it is unit-testable; `useMenuBarStatus` feeds it.
//
// Row keys go back to the window on click: `t:<pane>`, `c:<chat>`,
// `m:<teammate>`, `phone`. Titles are names, never prompt text — a chat's
// `run.ask` is what the person typed, so the menu uses the chat's own title.

export interface SnapshotPane {
  id: number;
  projectId: string;
  status: string;
  visibility?: string;
  title: string;
  agentId?: string;
  customTitle?: string | null;
  autoTitle?: string | null;
  osc?: string | null;
}

export interface SnapshotInput {
  enabled: boolean;
  panes: SnapshotPane[];
  activity: Record<number, ActivityState>;
  chats: Record<string, ChatRun>;
  teammates: InboxItem[];
  phones: number;
  projects: { id: string; name: string }[];
  history: NotificationItem[];
  now: number;
}

/** Finished and failed runs stay under Recent for an hour. */
export const RECENT_WINDOW_MS = 60 * 60 * 1000;
const RECENT_LIMIT = 3;
const OFF: MenuBarSnapshot = { enabled: false, attention: [], working: [], recent: [] };

function paneLabel(pane: SnapshotPane): string {
  return pane.customTitle || pane.autoTitle || pane.osc || pane.title || "Terminal";
}

export function buildMenuBarSnapshot(input: SnapshotInput): MenuBarSnapshot {
  if (!input.enabled) return OFF;
  const names = new Map(input.projects.map((project) => [project.id, project.name]));
  const project = (id: string) => names.get(id) ?? "";
  const live = input.panes.filter((pane) => pane.status === "running" && pane.visibility !== "hibernated");
  const panes = (state: ActivityState): MenuBarRow[] =>
    live
      .filter((pane) => input.activity[pane.id] === state)
      .map((pane) => ({ key: `t:${pane.id}`, title: paneLabel(pane), project: project(pane.projectId), agent: pane.agentId ?? "" }));
  const chats = Object.entries(input.chats);
  const chat = (state: string): MenuBarRow[] =>
    chats
      .filter(([, entry]) => entry.run.state === state)
      .map(([id, entry]) => ({ key: `c:${id}`, title: entry.title || "Agent chat", project: project(entry.projectId), agent: entry.agentId }));
  const teammates: MenuBarRow[] = input.teammates
    .filter((item) => typeof item.destination.agentId === "string")
    .map((item) => ({ key: `m:${item.destination.agentId}`, title: item.title, project: "", agent: "" }));
  const phones: MenuBarRow[] = input.phones > 0
    ? [{ key: "phone", title: input.phones === 1 ? "iPhone wants to connect" : `${input.phones} iPhones want to connect`, project: "", agent: "" }]
    : [];
  const attention = unique([...panes("attention"), ...chat("waiting"), ...teammates, ...phones]);
  const working = [...panes("working"), ...chat("working")];
  return { enabled: true, attention, working, recent: recent(input, new Set([...attention, ...working].map((row) => row.key))) };
}

function unique(rows: MenuBarRow[]): MenuBarRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => !seen.has(row.key) && Boolean(seen.add(row.key)));
}

/** Finished and failed terminals from the notification history, newest first.
 * A run that is busy again belongs under Working or Needs you, not here. */
function recent(input: SnapshotInput, busy: Set<string>): MenuBarRecent[] {
  const byId = new Map(input.panes.map((pane) => [pane.id, pane]));
  const out: MenuBarRecent[] = [];
  for (const item of [...input.history].sort((a, b) => b.at - a.at)) {
    if (out.length >= RECENT_LIMIT || input.now - item.at > RECENT_WINDOW_MS) break;
    if (item.category !== "agentDone" && item.category !== "agentFailed") continue;
    const id = item.action?.id === "focusSession" ? item.action.arg : undefined;
    if (typeof id !== "number" || busy.has(`t:${id}`)) continue;
    busy.add(`t:${id}`);
    const pane = byId.get(id);
    out.push({ key: `t:${id}`, title: pane ? paneLabel(pane) : item.title, agent: pane?.agentId ?? "", outcome: item.category === "agentFailed" ? "failed" : "done" });
  }
  return out;
}
