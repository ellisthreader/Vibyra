async function startTerminalProjectPreview(launch = null) {
  if (!terminalTestProjectId || terminalTestLoading) return;
  const activeLaunch = launch || terminalTestLaunch;
  if (!activeLaunch?.available || !activeLaunch?.id) return;
  const request = terminalTestRequest;
  const projectId = terminalTestProjectId;
  const targetId = activeLaunch.id;
  beginTerminalTestLoading(activeLaunch, `Starting ${activeLaunch?.framework || "the project preview"}...`);
  beginTerminalTestStartupFeed(activeLaunch.id);
  try {
    const result = await terminalTestPost("/desktop/preview/start-server", {
      projectId,
      targetId: activeLaunch.id
    });
    if (!terminalTestOperationIsCurrent(request, projectId, targetId)) return;
    const preview = result.preview || {};
    setTerminalTestProjectRecommendation(preview.recommendation);
    applyTerminalTestServiceState(preview);
    terminalTestActiveTargetId ||= activeLaunch.id;
    setTerminalTestUrl(preview.url || terminalTestService(activeLaunch.id)?.url || "", preview.message || "Preview server started");
    finishTerminalTestLoading();
  } catch (error) {
    if (!terminalTestOperationIsCurrent(request, projectId, targetId)) return;
    await refreshTerminalTestStartupFeed();
    const message = error.message || "Could not start the preview server";
    setTerminalTestUrl("", message);
    finishTerminalTestLoading(message);
  }
}

async function activateTerminalProjectPreview(targetId = terminalTestTargetId) {
  const service = terminalTestService(targetId);
  if (!terminalTestProjectId || !terminalTestServiceRunning(service) || terminalTestTargetPendingId) return;
  const request = terminalTestRequest;
  const projectId = terminalTestProjectId;
  terminalTestTargetPendingId = targetId;
  syncTerminalTestWorkspace();
  try {
    const result = await terminalTestPost("/desktop/preview/activate", {
      projectId,
      targetId
    });
    if (!terminalTestOperationIsCurrent(request, projectId, targetId)) return;
    const preview = result.preview || {};
    applyTerminalTestServiceState(preview);
    terminalTestActiveTargetId = String(preview.activeTargetId || targetId);
    setTerminalTestUrl(preview.url || terminalTestService(targetId)?.url || service.url || "", preview.message || "Preview selected");
  } catch (error) {
    if (!terminalTestOperationIsCurrent(request, projectId, targetId)) return;
    terminalTestStatus = error.message || "Could not open the running preview";
  } finally {
    if (!terminalTestOperationIsCurrent(request, projectId)) return;
    terminalTestTargetPendingId = "";
    syncTerminalTestWorkspace();
  }
}

async function stopTerminalProjectPreview() {
  const target = terminalTestSelectedTarget();
  if (!terminalTestProjectId || !target || terminalTestTargetPendingId) return;
  const request = terminalTestRequest;
  const projectId = terminalTestProjectId;
  terminalTestTargetPendingId = target.id;
  syncTerminalTestWorkspace();
  try {
    const result = await terminalTestPost("/desktop/preview/stop-server", {
      projectId,
      targetId: target.id
    });
    if (!terminalTestOperationIsCurrent(request, projectId, target.id)) return;
    const preview = result.preview || {};
    applyTerminalTestServiceState(preview);
    if (terminalTestActiveTargetId) {
      selectTerminalTestViewport(terminalTestActiveTargetId);
      terminalTestLaunch = terminalTestSelectedTarget();
    }
    terminalTestUrl = terminalTestIsolatedUrl(preview.url || "");
    terminalTestStatus = `${target.name} stopped`;
  } catch (error) {
    if (!terminalTestOperationIsCurrent(request, projectId, target.id)) return;
    terminalTestStatus = error.message || "Could not stop the preview";
  } finally {
    if (!terminalTestOperationIsCurrent(request, projectId)) return;
    terminalTestTargetPendingId = "";
    syncTerminalTestWorkspace();
  }
}

function runTerminalTestTargetAction() {
  const action = terminalTestTargetAction();
  if (action?.kind === "run") return void startTerminalProjectPreview();
  if (action?.kind === "view") return void activateTerminalProjectPreview();
  if (action?.kind === "stop") return void stopTerminalProjectPreview();
}

function terminalTestOperationIsCurrent(request, projectId, targetId = "") {
  if (request !== terminalTestRequest || projectId !== terminalTestProjectId) return false;
  return !targetId || targetId === terminalTestTargetId;
}
