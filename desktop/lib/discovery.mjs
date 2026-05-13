import dgram from "node:dgram";
import { connectionUrls, machineName, PORT } from "./state.mjs";

const DISCOVERY_PORT = Number(process.env.VIBYRA_DISCOVERY_PORT ?? 4318);
const ANNOUNCE_INTERVAL_MS = 2500;

export function startDiscoveryBroadcast() {
  const socket = dgram.createSocket("udp4");
  let interval = null;
  let running = false;

  socket.on("error", (error) => {
    console.warn(`Vibyra discovery broadcast stopped: ${error.message}`);
    if (interval) clearInterval(interval);
    if (running) socket.close();
    running = false;
  });

  socket.bind(() => {
    running = true;
    socket.setBroadcast(true);
    announce(socket);
    interval = setInterval(() => announce(socket), ANNOUNCE_INTERVAL_MS);
  });

  return () => {
    if (interval) clearInterval(interval);
    if (running) socket.close();
    running = false;
  };
}

function announce(socket) {
  const payload = Buffer.from(JSON.stringify({
    type: "vibyra.desktop",
    message: "I am Vibyra-PC",
    machineName,
    port: PORT,
    urls: connectionUrls()
  }));

  socket.send(payload, DISCOVERY_PORT, "255.255.255.255");
}
