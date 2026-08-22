import { getVersion } from "@tauri-apps/api/app";

import { rendererPolicy } from "../ipc/render";
import { useAccountStore } from "../state/accountStore";
import { useProjectStore } from "../state/projectStore";
import { useSettingsStore } from "../state/settingsStore";
import { paneLabel, useTerminalStore } from "../state/terminalStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { areaFor } from "./reportDraft";
import { isSuspendedId } from "./sessionRestore";

// Everything Vibyra can answer on the user's behalf, so a report arrives
// knowing where it came from. All of it is shown to the user before they send
// it — nothing here is collected quietly.

export interface ReportContext {
  appVersion: string;
  platform: string;
  renderer: string | null;
  view: string | null;
  project: string | null;
  projectRoot: string | null;
  agent: string | null;
  model: string | null;
  pane: string | null;
  reporter: string | null;
  locale: string | null;
  screen: string | null;
}

export interface ReportSurroundings {
  context: ReportContext;
  /** The live pane whose output can be attached, or null when none is. */
  sessionId: number | null;
  /** Best guess at the part of the app the user is looking at. */
  area: string;
  /** Human name for the pane, for the "include output" toggle's label. */
  paneName: string | null;
}

function platformLabel(): string {
  const agent = navigator.userAgent;
  const system = /\(([^)]+)\)/.exec(agent)?.[1] ?? navigator.platform ?? "unknown";
  return system.split(";")[0]?.trim() || "unknown";
}

/** Renderer mode is the first question a "looks wrong" report raises, and the
 * user has no way to answer it. */
async function rendererLabel(): Promise<string | null> {
  const policy = await rendererPolicy().catch(() => null);
  if (!policy) return null;
  const flags = [
    policy.softwareCompositing ? "software compositing" : null,
    policy.nvidiaSession ? "nvidia" : null,
    policy.environmentOverride ? "env override" : null,
  ].filter(Boolean);
  return flags.length ? `${policy.mode} (${flags.join(", ")})` : policy.mode;
}

export async function gatherSurroundings(): Promise<ReportSurroundings> {
  const workspace = useWorkspaceStore.getState();
  const project = useProjectStore.getState();
  const terminals = useTerminalStore.getState();
  const profile = useAccountStore.getState().snapshot.profile;
  const projects = useSettingsStore.getState().settings?.projects ?? [];
  const focused = terminals.panes.find((pane) => pane.id === terminals.focusedId) ?? null;
  const active = projects.find((entry) => entry.id === project.activeId) ?? null;
  // A suspended pane has no live session, so there is no output to offer.
  const sessionId = focused && !isSuspendedId(focused.id) ? focused.id : null;
  const [appVersion, renderer] = await Promise.all([
    getVersion().catch(() => "unknown"),
    rendererLabel(),
  ]);

  return {
    sessionId,
    paneName: focused ? paneLabel(focused) : null,
    area: areaFor({
      settingsOpen: workspace.settingsOpen,
      companionOpen: workspace.companionOpen,
      projectMode: workspace.projectMode,
      view: project.view,
      hasPane: focused !== null,
    }),
    context: {
      appVersion,
      platform: platformLabel(),
      renderer,
      view: project.view === "project" ? workspace.projectMode : "home",
      project: active?.name ?? null,
      projectRoot: active?.root ?? null,
      agent: focused?.agentId ?? null,
      model: focused?.model ?? null,
      pane: focused ? paneLabel(focused) : null,
      reporter: profile ? `${profile.name} (${profile.email})` : null,
      locale: navigator.language || null,
      screen: `${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio}x`,
    },
  };
}
