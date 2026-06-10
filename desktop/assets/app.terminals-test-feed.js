let terminalTestStartupFeedTimer = 0;
let terminalTestStartupTargetId = "";

function beginTerminalTestStartupFeed(targetId) {
  terminalTestStartupTargetId = String(targetId || terminalTestTargetId);
  terminalTestStartupOutput = terminalTestLaunch?.command ? `$ ${terminalTestLaunch.command}\n` : "";
  clearInterval(terminalTestStartupFeedTimer);
  terminalTestStartupFeedTimer = setInterval(() => void refreshTerminalTestStartupFeed(), 300);
  void refreshTerminalTestStartupFeed();
}

async function refreshTerminalTestStartupFeed() {
  if (!terminalTestProjectId || !terminalTestStartupTargetId) return;
  try {
    const query = new URLSearchParams({
      projectId: terminalTestProjectId,
      targetId: terminalTestStartupTargetId
    });
    const response = await fetch(`/desktop/preview/startup?${query}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.startup) return;
    terminalTestStartupOutput = String(result.startup.output || "").slice(-12000);
    syncTerminalTestWorkspace();
  } catch {
    // The approved start request still owns the final success or error result.
  }
}

function stopTerminalTestStartupFeed() {
  clearInterval(terminalTestStartupFeedTimer);
  terminalTestStartupFeedTimer = 0;
}

function clearTerminalTestStartupFeed() {
  stopTerminalTestStartupFeed();
  terminalTestStartupTargetId = "";
  terminalTestStartupOutput = "";
}
