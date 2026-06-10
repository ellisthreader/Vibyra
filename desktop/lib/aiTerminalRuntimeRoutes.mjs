import { installTerminalRuntime, terminalRuntimeState } from "./aiTerminalRuntimes.mjs";
import { send } from "./http.mjs";

export async function handleAiTerminalRuntimeRoutes(req, res, url) {
  if (req.method === "GET" && url.pathname === "/desktop/terminal-runtimes") {
    send(res, 200, terminalRuntimeState());
    return true;
  }
  const match = url.pathname.match(/^\/desktop\/terminal-runtimes\/([^/]+)\/install$/);
  if (req.method === "POST" && match) {
    const runtime = await installTerminalRuntime(decodeURIComponent(match[1]));
    send(res, 200, { ok: true, runtime, ...terminalRuntimeState() });
    return true;
  }
  return false;
}
