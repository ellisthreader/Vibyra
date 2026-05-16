import { createServer } from "node:net";
import { devServerPortsFromPackage } from "./previewFrameworkProfiles.mjs";

export async function choosePreviewPort(packageText, profile) {
  for (const port of devServerPortsFromPackage(packageText, profile)) {
    if (await portLooksFree(port)) return port;
  }
  return randomFreePort();
}

export async function portLooksFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    const done = (available) => {
      server.removeAllListeners();
      resolve(available);
    };
    server.once("error", () => done(false));
    server.listen(port, "0.0.0.0", () => {
      server.close(() => done(true));
    });
  });
}

async function randomFreePort() {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "0.0.0.0", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}
