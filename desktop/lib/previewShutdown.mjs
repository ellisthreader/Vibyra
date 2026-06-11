import { stopAllTrackedPreviewServers } from "./previewServerProcesses.mjs";

const shutdownByServer = new WeakMap();

export function requestPreviewShutdown(server, exitCode = 0, error = null) {
  const shutdown = server ? shutdownByServer.get(server) : null;
  if (!shutdown) return false;
  shutdown(exitCode, error);
  return true;
}

export function installPreviewShutdownHandlers(options = {}) {
  const processRef = options.processRef ?? process;
  const server = options.server;
  const stopPreviews = options.stopPreviews ?? stopAllTrackedPreviewServers;
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 1_000;
  const sockets = new Set();
  let shuttingDown = false;
  let shutdownTimer = null;
  const stopPreviewsSafely = () => {
    try {
      stopPreviews();
    } catch (error) {
      console.error("Preview cleanup failed during shutdown:", error);
    }
  };
  const exit = (exitCode) => {
    if (shutdownTimer) clearTimeout(shutdownTimer);
    shutdownTimer = null;
    processRef.exit(exitCode);
  };
  const forceClose = (exitCode) => {
    for (const socket of sockets) socket.destroy?.();
    server?.closeAllConnections?.();
    exit(exitCode);
  };

  const shutdown = (exitCode = 0, error = null) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (error) console.error(error instanceof Error ? error.stack || error.message : error);
    stopPreviewsSafely();
    if (server?.listening) {
      server.close(() => exit(exitCode));
      server.closeIdleConnections?.();
      shutdownTimer = setTimeout(() => forceClose(exitCode), shutdownTimeoutMs);
      shutdownTimer.unref?.();
      return;
    }
    exit(exitCode);
  };
  const onConnection = (socket) => {
    sockets.add(socket);
    socket.once?.("close", () => sockets.delete(socket));
  };
  const onSigint = () => shutdown(0);
  const onSigterm = () => shutdown(0);
  const onException = (error) => shutdown(1, error);
  const onRejection = (error) => shutdown(1, error);
  const onServerClose = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopPreviewsSafely();
  };

  processRef.on("SIGINT", onSigint);
  processRef.on("SIGTERM", onSigterm);
  processRef.on("uncaughtException", onException);
  processRef.on("unhandledRejection", onRejection);
  server?.on?.("connection", onConnection);
  server?.on?.("close", onServerClose);
  if (server) shutdownByServer.set(server, shutdown);
  return () => {
    if (shutdownTimer) clearTimeout(shutdownTimer);
    processRef.off("SIGINT", onSigint);
    processRef.off("SIGTERM", onSigterm);
    processRef.off("uncaughtException", onException);
    processRef.off("unhandledRejection", onRejection);
    server?.off?.("connection", onConnection);
    server?.off?.("close", onServerClose);
    if (server && shutdownByServer.get(server) === shutdown) shutdownByServer.delete(server);
  };
}
