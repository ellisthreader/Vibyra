import { createServer } from "node:http";
import { startDiscoveryBroadcast } from "./lib/discovery.mjs";
import { discoverProjects } from "./lib/projects.mjs";
import { handle } from "./lib/routes.mjs";
import { handlePtyTerminalUpgrade } from "./lib/ptyTerminals.mjs";
import { appState, connectionUrls, PAIR_CODE, PORT } from "./lib/state.mjs";
import { openDesktopWindow } from "./lib/window.mjs";

appState.server = createServer(handle);
appState.server.on("upgrade", handlePtyTerminalUpgrade);

appState.server.listen(PORT, "0.0.0.0", async () => {
  startDiscoveryBroadcast();
  openDesktopWindow();
  void discoverProjects().catch((error) => {
    console.error(error instanceof Error ? error.message : "Project discovery failed");
  });
  console.log("Vibyra Desktop is running");
  console.log(`Pair code: ${PAIR_CODE}`);
  console.log(`Desktop screen: http://127.0.0.1:${PORT}/desktop`);
  for (const url of connectionUrls()) console.log(`Phone URL: ${url}`);
});

appState.server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("Vibyra Desktop is already open.");
    openDesktopWindow();
    setTimeout(() => process.exit(0), 400);
    return;
  }
  throw error;
});
