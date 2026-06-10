function terminalTaskAssignmentId(terminal) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `assignment-${terminal?.id || "terminal"}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function terminalTaskActivityStart(terminal, prompt, assignmentId = "") {
  return String(assignmentId || terminalTaskAssignmentId(terminal));
}

function terminalTaskActivityAccepted() {}

function terminalTaskActivityOutput() {}

function terminalTaskActivityFailed() {}

function terminalTaskActivityClear(terminal) {
  if (terminal) delete terminal.taskActivity;
}

function terminalTaskActivityHtml() {
  return "";
}

function terminalTaskActivityRefresh() {}

function terminalTaskActivitySignature() {
  return "";
}
