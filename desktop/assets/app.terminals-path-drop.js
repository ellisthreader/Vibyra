const terminalScreenshotPathType = "application/x-vibyra-screenshot-path";
const terminalImageDropTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/avif"]);
const terminalImageDropExtensions = /\.(?:png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i;

function terminalHasScreenshotPath(dataTransfer) {
  return Boolean(dataTransfer?.types?.includes(terminalScreenshotPathType));
}

function terminalHasImageFileDrop(dataTransfer) {
  if (!dataTransfer?.types?.includes("Files")) return false;
  const items = Array.from(dataTransfer.items || []);
  if (!items.length) return true;
  return items.some((item) => item?.kind === "file" && (
    terminalImageDropTypes.has(String(item.type || "").toLowerCase())
    || !item.type
  ));
}

function terminalHasPathDrop(dataTransfer) {
  return terminalHasScreenshotPath(dataTransfer) || terminalHasImageFileDrop(dataTransfer);
}

function terminalDroppedScreenshotPath(dataTransfer) {
  if (!terminalHasScreenshotPath(dataTransfer)) return "";
  return dataTransfer.getData(terminalScreenshotPathType).trim();
}

async function terminalDroppedFilePath(dataTransfer) {
  const file = Array.from(dataTransfer?.files || []).find(terminalDroppedFileIsImage);
  if (!file) return "";
  const path = await terminalPathForDroppedFile(file);
  return path ? shellQuoteTerminalPath(path) : "";
}

function terminalDroppedFileIsImage(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || file?.path || "");
  return terminalImageDropTypes.has(type) || terminalImageDropExtensions.test(name);
}

async function terminalDroppedPath(dataTransfer) {
  return terminalDroppedScreenshotPath(dataTransfer) || await terminalDroppedFilePath(dataTransfer);
}

async function terminalPathForDroppedFile(file) {
  if (!file) return "";
  if (window.vibyraDesktopFiles?.pathForFile) {
    const resolved = await window.vibyraDesktopFiles.pathForFile(file);
    if (resolved) return String(resolved);
  }
  return String(file.path || "");
}

function shellQuoteTerminalPath(path) {
  return `'${String(path).replace(/'/g, `'\\''`)}'`;
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
    if (!terminalHasPathDrop(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    node.classList.add("terminal-path-dragover");
  });
  node.addEventListener("dragleave", (event) => {
    if (!node.contains(event.relatedTarget)) node.classList.remove("terminal-path-dragover");
  });
  node.addEventListener("drop", async (event) => {
    if (!terminalHasPathDrop(event.dataTransfer)) return;
    event.preventDefault();
    node.classList.remove("terminal-path-dragover");
    const path = await terminalDroppedPath(event.dataTransfer);
    if (!path) return;
    insertDroppedScreenshotPath(node.dataset.terminalInput, path);
  });
}
