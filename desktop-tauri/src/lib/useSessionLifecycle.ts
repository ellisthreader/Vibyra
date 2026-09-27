import { useEffect } from "react";

import { listen } from "@tauri-apps/api/event";

import { ackCloseRequest, armCloseGuard } from "../ipc/session";
import { useCloseGuardStore } from "../state/closeGuardStore";
import { startPhoneTerminalRequests } from "./phoneTerminalRequests";
import { startPhoneWorkspacePublishing } from "./phoneWorkspaceSync";
import { startSessionPersistence } from "./sessionPersistence";

/**
 * Keeps the saved session current, tells the iPhone connection which projects
 * and terminals this window is showing, starts and closes terminals a phone
 * asks for, and answers Rust's close veto.
 *
 * Rust prevents the first `CloseRequested` and emits to the UI instead, so a
 * window with live terminals can warn before killing them and flush the
 * session to disk first. It only does that while this hook is mounted —
 * arming is what tells it there is someone to ask. The acknowledgement goes
 * back before the user is prompted, so a webview that is merely *slow* is
 * never mistaken for one that has died.
 */
export function useSessionLifecycle(): void {
  useEffect(() => {
    const stopPersisting = startSessionPersistence();
    const stopPublishing = startPhoneWorkspacePublishing();
    const stopAnswering = startPhoneTerminalRequests();
    const unlisten = listen("vibyra://close-requested", () => {
      void ackCloseRequest().catch(() => {});
      void useCloseGuardStore.getState().request();
    });
    // Armed after the listener exists, disarmed before it is torn down, so
    // there is never a window where Rust vetoes into nothing.
    const armed = unlisten.then(() => armCloseGuard(true).catch(() => {}));
    return () => {
      stopPersisting();
      stopPublishing();
      stopAnswering();
      void armed.then(() => armCloseGuard(false).catch(() => {}));
      void unlisten.then((off) => off());
    };
  }, []);
}
