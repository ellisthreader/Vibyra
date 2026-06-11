function terminalHasScreenshotPath(dataTransfer) {
  return Boolean(dataTransfer?.types?.includes("application/x-vibyra-screenshot-path"));
}

function terminalDroppedScreenshotPath(dataTransfer) {
  if (!terminalHasScreenshotPath(dataTransfer)) return "";
  return dataTransfer.getData("application/x-vibyra-screenshot-path").trim();
}

function insertDroppedScreenshotPath(id, path) {
  const xterm = typeof terminalXterms === "object" ? terminalXterms[id] : null;
  if (xterm?.element?.isConnected !== false && typeof xterm?.paste === "function") {
    focusPtyTerminal(id);
    xterm.paste(path);
    return true;
  }
  return terminalCompanionInsertIntoTerminal(id, path, false);
}

function bindTerminalPathDrop(node) {
  if (!node || node.dataset.terminalPathDropBound) return;
  node.dataset.terminalPathDropBound = "1";
  node.addEventListener("dragover", (event) => {
    if (!terminalHasScreenshotPath(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    node.classList.add("terminal-path-dragover");
  });
  node.addEventListener("dragleave", (event) => {
    if (!node.contains(event.relatedTarget)) node.classList.remove("terminal-path-dragover");
  });
  node.addEventListener("drop", (event) => {
    const path = terminalDroppedScreenshotPath(event.dataTransfer);
    if (!path) return;
    event.preventDefault();
    node.classList.remove("terminal-path-dragover");
    insertDroppedScreenshotPath(node.dataset.terminalInput, path);
  });
}
