import { aiServiceStatus } from "../ipc/ai";
import { searchMemorySources } from "../ipc/memory";
import { perfSample } from "../ipc/perf";
import { terminalSnapshot } from "../ipc/terminal";
import { redactedTail } from "../lib/askRedact";
import {
  TAIL_CHARS,
  panesWorthReading,
  type AskPane,
  type AskWorkspace,
} from "../lib/askContext";
import { formatVaultContext } from "../lib/vaultContext";
import { paneLabel } from "./terminalStore";
import type { PaneState } from "./terminalStore";
import { useProjectStore } from "./projectStore";
import { useSettingsStore } from "./settingsStore";
import { useTerminalStore } from "./terminalStore";

// Reads the live app into the plain snapshot `askContext` turns into a
// briefing. Everything expensive — a perf sample, a usage lookup, a scrollback
// — happens here and only when a question is actually asked, so an open panel
// costs nothing until it is used.

/** How much of a pane's scrollback may ever be sent, before redaction. */
const TAIL_SOURCE_CHARS = TAIL_CHARS * 3;

function toAskPane(pane: PaneState, activity: Record<number, string>, now: number): AskPane {
  return {
    id: pane.id,
    label: paneLabel(pane),
    projectName: pane.projectId,
    status: pane.status,
    hibernated: pane.visibility === "hibernated",
    activity: (activity[pane.id] as AskPane["activity"]) ?? "idle",
    exitCode: pane.exitCode,
    workspaceMode: pane.workspaceMode,
    branch: pane.workspace?.branch ?? null,
    chatTitle: pane.chatTitle,
    idleMs: Math.max(0, now - pane.lastFocusedAt),
  };
}

/** Scrollback for the panes worth reading, cut and scrubbed. Never throws. */
async function readTails(panes: AskPane[]): Promise<{ tails: AskWorkspace["tails"]; redactions: number }> {
  const wanted = panesWorthReading(panes);
  const results = await Promise.all(
    wanted.map(async (paneId) => {
      const raw = await terminalSnapshot(paneId).catch(() => null);
      const { text, count } = redactedTail(raw, TAIL_SOURCE_CHARS);
      return { paneId, text: text.slice(-TAIL_CHARS), count };
    }),
  );
  return {
    tails: results.filter((entry) => entry.text).map(({ paneId, text }) => ({ paneId, text })),
    redactions: results.reduce((sum, entry) => sum + entry.count, 0),
  };
}

export interface WorkspaceReading {
  workspace: AskWorkspace;
  panes: AskPane[];
  /** Secrets removed from the scrollback, for telling the user what was sent. */
  redactions: number;
}

/** The panes as Ask sees them, without paying for perf, usage or scrollback. */
export function readPanes(projectId: string | null): AskPane[] {
  const { panes, activity } = useTerminalStore.getState();
  const projects = useSettingsStore.getState().settings?.projects ?? [];
  const name = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const now = Date.now();
  return panes
    .filter((pane) => projectId === null || pane.projectId === projectId)
    .map((pane) => ({ ...toAskPane(pane, activity, now), projectName: name(pane.projectId) }));
}

/**
 * The full reading, for a question that is actually being asked.
 *
 * The question is passed in because the vault is searched with it: your own
 * notes are part of the briefing when they match, which is the whole reason
 * the retrieval engine was kept when the Memory panel went.
 */
export async function readWorkspace(question: string): Promise<WorkspaceReading> {
  const settings = useSettingsStore.getState().settings;
  const projects = settings?.projects ?? [];
  const activeId = useProjectStore.getState().activeId;
  const active = projects.find((project) => project.id === activeId) ?? null;

  // Every pane, not just this project's: "is anything waiting on me" has to be
  // answerable about the work you are not currently looking at.
  const panes = readPanes(null);
  const [perf, service, read, notes] = await Promise.all([
    perfSample().catch(() => null),
    aiServiceStatus().catch(() => null),
    readTails(panes),
    searchMemorySources(question).catch(() => []),
  ]);

  const workspace: AskWorkspace = {
    activeProject: active ? { name: active.name, root: active.root } : null,
    otherProjects: projects.filter((p) => p.id !== activeId).map((p) => p.name),
    panes,
    perf: perf
      ? {
          rendererCpu: perf.rendererCpuPercent ?? null,
          appCpu: perf.appCpuPercent,
          memUsedGb: perf.memUsedBytes / 1e9,
          memTotalGb: perf.memTotalBytes / 1e9,
        }
      : null,
    usage: service
      ? {
          spendMonthUsd: service.usage.spendMonthUsd,
          spendTodayUsd: service.usage.spendTodayUsd,
          callsThisMonth: service.usage.callsThisMonth,
        }
      : null,
    settings: {
      performanceMode: settings?.performanceMode ?? "standard",
      rendererMode: settings?.rendererMode ?? "auto",
    },
    tails: read.tails,
    vaultNotes: formatVaultContext(notes),
  };

  return { workspace, panes, redactions: read.redactions };
}
