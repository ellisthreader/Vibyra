const terminalActionProtocolVersion = "2026-06-08.1";
const compatibleDesktopActionRunner = window.runDesktopActions;
let terminalActionProtocolReady = false;

window.runDesktopActions = async (...args) => {
  if (!terminalActionProtocolReady) {
    throw new Error("Vibyra Desktop is refreshing its terminal controls. No terminal action ran.");
  }
  return compatibleDesktopActionRunner(...args);
};

async function verifyTerminalActionProtocol() {
  try {
    const query = new URLSearchParams({ rendererProtocolVersion: terminalActionProtocolVersion });
    const response = await fetch(`/desktop/runtime?${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Desktop runtime check failed");
    const runtime = await response.json();
    if (runtime.terminalActionProtocolVersion === terminalActionProtocolVersion) {
      terminalActionProtocolReady = true;
      return;
    }
  } catch {
    // Keep terminal actions blocked until a compatible bridge is available.
  }
  fetch("/desktop/runtime/renderer-mismatch", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rendererProtocolVersion: terminalActionProtocolVersion })
  }).catch(() => {});
}

bootstrapDesktop();
verifyTerminalActionProtocol();
startDesktopRefresh();
