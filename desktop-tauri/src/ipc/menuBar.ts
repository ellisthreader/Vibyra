import { invoke } from "@tauri-apps/api/core";

/** One row as the menu bar shows it: a name and its project, never output.
 * `key` is handed back on click: `t:<pane>`, `c:<chat>`, `m:<teammate>`, `phone`. */
export interface MenuBarRow {
  key: string;
  title: string;
  project: string;
  /** `claude`, `codex`, `gemini`… for the logo; empty for an iPhone or a teammate. */
  agent: string;
}

export interface MenuBarRecent {
  key: string;
  title: string;
  agent: string;
  outcome: "done" | "failed";
}

/** Mirrors `menu_bar_status::StatusSnapshot`. */
export interface MenuBarSnapshot {
  enabled: boolean;
  attention: MenuBarRow[];
  working: MenuBarRow[];
  recent: MenuBarRecent[];
}

export function sendMenuBarStatus(snapshot: MenuBarSnapshot): Promise<void> {
  return invoke("menu_bar_status", { snapshot });
}
