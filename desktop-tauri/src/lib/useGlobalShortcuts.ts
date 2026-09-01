import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { useEffect } from "react";

import { useProjectStore } from "../state/projectStore";
import { useScreenshotStore } from "../state/screenshotStore";
import { useSettingsStore } from "../state/settingsStore";
import { useTerminalStore } from "../state/terminalStore";
import { useVoiceStore } from "../state/voiceStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { handleAgentShortcut } from "./agentShortcuts.ts";
import { shortcutFromEvent, type HotkeyAction } from "./hotkeys";
import type { DockSize, DockTool } from "./dockLayout";

/** Alt 1–5, in the order the dock's tab strip shows them. */
const DOCK_TOOLS: DockTool[] = ["preview", "ask", "files", "review"];
const DOCK_SIZES: DockSize[] = ["compact", "wide", "full"];

const nativeActions = new Set<HotkeyAction>();
let registered = new Map<HotkeyAction, string>();
let registrationQueue = Promise.resolve();
let shortcutCaptureActive = false;

export function setShortcutCaptureActive(active: boolean): void {
  shortcutCaptureActive = active;
}

function runAction(action: HotkeyAction): void {
  if (shortcutCaptureActive) return;
  if (action === "voice") useVoiceStore.getState().toggle();
  else void useScreenshotStore.getState().capture();
}

function configureNativeShortcuts(bindings: Map<HotkeyAction, string>): void {
  registrationQueue = registrationQueue.then(async () => {
    const staleShortcuts = new Set([...registered.values(), ...bindings.values()]);
    for (const shortcut of staleShortcuts) await unregister(shortcut).catch(() => {});
    registered = new Map();
    nativeActions.clear();
    const claimed = new Set<string>();
    for (const [action, shortcut] of bindings) {
      if (claimed.has(shortcut)) {
        useWorkspaceStore.getState().setError("Voice and screenshot need different shortcuts.");
        continue;
      }
      claimed.add(shortcut);
      try {
        await register(shortcut, (event) => {
          if (event.state === "Pressed") runAction(action);
        });
        registered.set(action, shortcut);
        nativeActions.add(action);
      } catch (error) {
        useWorkspaceStore
          .getState()
          .setError(`${shortcut} is unavailable: ${String(error)}`);
      }
    }
  });
}

/** Native global F8/F9-equivalent bindings plus focused-window fallbacks. */
export function useGlobalShortcuts(): void {
  const voiceShortcut = useSettingsStore((state) => state.settings?.voiceShortcut);
  const screenshotShortcut = useSettingsStore((state) => state.settings?.screenshotShortcut);

  useEffect(() => {
    if (!voiceShortcut || !screenshotShortcut) return;
    configureNativeShortcuts(
      new Map([
        ["voice", voiceShortcut],
        ["screenshot", screenshotShortcut],
      ]),
    );
    return () => configureNativeShortcuts(new Map());
  }, [voiceShortcut, screenshotShortcut]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || shortcutCaptureActive) return;
      const shortcut = shortcutFromEvent(event);
      if (shortcut && shortcut === voiceShortcut && !nativeActions.has("voice")) {
        event.preventDefault();
        event.stopPropagation();
        runAction("voice");
        return;
      }
      if (shortcut && shortcut === screenshotShortcut && !nativeActions.has("screenshot")) {
        event.preventDefault();
        event.stopPropagation();
        runAction("screenshot");
        return;
      }
      // Agent and Chat Mode's own keyboard, refused while Code Mode has the
      // window so a terminal keeps every key it is sent.
      if (handleAgentShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.code === "KeyK") {
        event.preventDefault();
        const workspace = useWorkspaceStore.getState();
        workspace.setPaletteOpen(!workspace.paletteOpen);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "KeyH") {
        event.preventDefault();
        useProjectStore.getState().goHome();
        return;
      }
      // The dock. Backslash is free on every platform we ship, and the digit
      // rows below already refuse Alt, so Alt 1–5 collides with nothing.
      if ((event.ctrlKey || event.metaKey) && event.code === "Backslash") {
        event.preventDefault();
        const workspace = useWorkspaceStore.getState();
        if (!event.shiftKey) {
          workspace.toggleDock();
          return;
        }
        const next = (DOCK_SIZES.indexOf(workspace.dockSize) + 1) % DOCK_SIZES.length;
        workspace.setDockSize(DOCK_SIZES[next]);
        return;
      }
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (!digit) return;
      const index = Number(digit[1]) - 1;
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const tool = DOCK_TOOLS[index];
        if (!tool) return;
        event.preventDefault();
        useWorkspaceStore.getState().setDockTool(tool);
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.shiftKey) {
        const target = useSettingsStore.getState().settings?.projects[index];
        if (target) void useProjectStore.getState().activate(target.id);
        return;
      }
      const terminals = useTerminalStore.getState();
      const target = terminals.panes.filter((pane) => pane.projectId === useProjectStore.getState().activeId)[index];
      if (target && useProjectStore.getState().view === "project") terminals.setFocus(target.id);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [voiceShortcut, screenshotShortcut]);
}
