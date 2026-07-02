import { createServer } from "node:net";
import { devServerPortsFromPackage } from "./previewFrameworkProfiles.mjs";

const reservedPorts = new Set();

export async function reservePreviewPort(packageText, profile, options = {}) {
  const excluded = new Set((options.exclude ?? []).map(Number));
  for (const port of devServerPortsFromPackage(packageText, profile)) {
    if (excluded.has(port) || reservedPorts.has(port)) continue;
    reservedPorts.add(port);
    if (await portLooksFree(port)) return reservation(port, true);
    reservedPorts.delete(port);
  }
  return reservation(await randomFreePort(excluded), true);
}

export async function portLooksFree(port) {
  // Check the loopback address as well: on Windows a wildcard bind succeeds even when
  // another server already listens on 127.0.0.1, which would hand out an occupied port.
  return await bindLooksFree(port, "0.0.0.0") && await bindLooksFree(port, "127.0.0.1");
}

function bindLooksFree(port, host) {
  return new Promise((resolve) => {
    const server = createServer();
    const done = (available) => {
      server.removeAllListeners();
      resolve(available);
    };
    server.once("error", () => done(false));
    server.listen(port, host, () => {
      server.close(() => done(true));
    });
  });
}

function reservation(port, alreadyReserved = false) {
  if (!alreadyReserved) reservedPorts.add(port);
  let released = false;
  return {
    port,
    release() {
      if (released) return;
      released = true;
      reservedPorts.delete(port);
    }
  };
}

async function randomFreePort(excluded) {
  while (true) {
    const port = await new Promise((resolve) => {
      const server = createServer();
      server.listen(0, "0.0.0.0", () => {
        const address = server.address();
        const selected = typeof address === "object" && address ? address.port : 0;
        if (!selected || excluded.has(selected) || reservedPorts.has(selected)) {
          server.close(() => resolve(0));
          return;
        }
        reservedPorts.add(selected);
        server.close(() => resolve(selected));
      });
    });
    if (port) return port;
  }
}
