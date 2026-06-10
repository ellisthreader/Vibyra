let screenshotStatusTimer = null;

function bindDesktopScreenshot() {
  const api = window.vibyraDesktopScreenshot;
  if (!api?.isElectron || document.body.dataset.screenshotBound) return;
  document.body.dataset.screenshotBound = "1";
  api.onCapture((payload) => void openScreenshotEditor(payload));
  api.onError((message) => showScreenshotNotice(String(message || "Screenshot capture failed.")));
  document.addEventListener("keydown", handleScreenshotKeyboard, true);
}

async function openScreenshotEditor(payload) {
  if (!payload?.dataUrl) return;
  const root = ensureScreenshotEditor();
  root.hidden = false;
  document.body.classList.add("screenshot-editing");
  selectScreenshotTool("crop");
  try {
    await loadScreenshotDocument(payload.dataUrl, true);
    root.querySelector("[data-screenshot-close]")?.focus();
  } catch (error) {
    closeScreenshotEditor();
    showScreenshotNotice(error instanceof Error ? error.message : "Screenshot could not be opened.");
  }
}

function closeScreenshotEditor() {
  const root = document.querySelector("[data-screenshot-editor]");
  if (!root || root.hidden) return;
  root.hidden = true;
  document.body.classList.remove("screenshot-editing");
  screenshotState.crop = null;
  screenshotState.drag = null;
  screenshotState.history = [];
  screenshotState.originalDataUrl = "";
  screenshotState.documentCanvas = null;
}

async function copyScreenshot() {
  const result = await window.vibyraDesktopScreenshot.copy(screenshotDataUrl());
  showScreenshotStatus(result?.ok ? "Copied to clipboard" : result?.error || "Copy failed");
}

async function saveScreenshot() {
  const result = await window.vibyraDesktopScreenshot.save(screenshotDataUrl());
  if (result?.canceled) return;
  showScreenshotStatus(result?.ok ? "Saved" : result?.error || "Save failed");
}

function showScreenshotStatus(message) {
  clearTimeout(screenshotStatusTimer);
  const status = document.querySelector("[data-screenshot-status]");
  if (!status) return;
  status.textContent = message;
  screenshotStatusTimer = setTimeout(() => {
    if (status) status.textContent = "F9 captures from anywhere";
  }, 2400);
}

function showScreenshotNotice(message) {
  let notice = document.querySelector("[data-screenshot-notice]");
  if (!notice) {
    notice = document.createElement("div");
    notice.className = "screenshot-notice";
    notice.dataset.screenshotNotice = "";
    notice.setAttribute("role", "status");
    document.body.append(notice);
  }
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(notice._hideTimer);
  notice._hideTimer = setTimeout(() => {
    notice.hidden = true;
  }, 4200);
}

function handleScreenshotKeyboard(event) {
  const root = document.querySelector("[data-screenshot-editor]");
  if (!root || root.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeScreenshotEditor();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    void undoScreenshotMutation();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const tool = { "1": "crop", "2": "box", "3": "pen" }[event.key];
  if (tool) {
    event.preventDefault();
    selectScreenshotTool(tool);
  }
}

bindDesktopScreenshot();
