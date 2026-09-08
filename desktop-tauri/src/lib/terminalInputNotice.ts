import { useNotificationStore } from "../state/notificationStore";

export function reportTerminalInputFailure(id: number, error: unknown): void {
  // Exited panes have their own lifecycle UI. Capacity rejection must remain
  // visible even when a keyboard caller intentionally ignores its Promise.
  if (!String(error).includes("Terminal input buffer is full")) return;
  useNotificationStore.getState().push({
    kind: "performance", tier: "risk", title: "Terminal input was not sent",
    body: "This terminal is not keeping up with input. Some input was not sent. Wait for it to catch up and check the command before pressing Enter.",
    replaceKey: `terminal-input-full:${id}`, inputRejected: true, osEligible: false, cue: "none"
  });
}
