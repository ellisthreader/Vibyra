import { stopAllTrackedPreviewServers } from "./previewServerProcesses.mjs";

export function installPreviewShutdownHandlers(options = {}) {
  const processRef = options.processRef ?? process;
  const server = options.server;
  const stopPreviews = options.stopPreviews ?? stopAllTrackedPreviewServers;
  let shuttingDown = false;
  const stopPreviewsSafely = () => {
    try {
      stopPreviews();
    } catch (error) {
      console.error("Preview cleanup failed during shutdown:", error);
    }
  };

  const shutdown = (exitCode = 0, error = null) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (error) console.error(error instanceof Error ? error.stack || error.message : error);
    stopPreviewsSafely();
    if (server?.listening) {
      server.close(() => processRef.exit(exitCode));
      return;
    }
    processRef.exit(exitCode);
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
  server?.on?.("close", onServerClose);
  return () => {
    processRef.off("SIGINT", onSigint);
    processRef.off("SIGTERM", onSigterm);
    processRef.off("uncaughtException", onException);
    processRef.off("unhandledRejection", onRejection);
    server?.off?.("close", onServerClose);
  };
}
