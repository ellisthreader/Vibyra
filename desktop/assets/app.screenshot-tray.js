const screenshotPathDragType = "application/x-vibyra-screenshot-path";
const screenshotTrayState = {
  items: []
};

function savedScreenshotTray() {
  let tray = document.querySelector("[data-screenshot-tray]");
  if (tray) return tray;
  tray = document.createElement("aside");
  tray.className = "screenshot-tray";
  tray.dataset.screenshotTray = "";
  tray.setAttribute("aria-label", "Saved screenshots");
  document.body.append(tray);
  return tray;
}

function renderSavedScreenshotTray() {
  const tray = savedScreenshotTray();
  const items = [...screenshotTrayState.items].reverse();
  tray.hidden = !items.length;
  if (!items.length) {
    tray.innerHTML = "";
    return;
  }
  tray.innerHTML = items.map((item, index) => `<div class="screenshot-tray-item" data-screenshot-item="${index}">
      <div class="screenshot-tray-preview" role="button" tabindex="0" draggable="true" data-screenshot-reveal aria-label="Show or drag saved screenshot" title="Drag into a chat">
        <img src="${escapeAttribute(item.thumbnailDataUrl)}" alt="" draggable="false" />
      </div>
      <button class="screenshot-tray-copy" type="button" data-screenshot-copy aria-label="Copy screenshot" title="Copy screenshot">${icon("copy")}</button>
      <button class="screenshot-tray-close" type="button" data-screenshot-dismiss aria-label="Dismiss saved screenshot">${icon("close")}</button>
    </div>`).join("");
  tray.querySelectorAll("[data-screenshot-item]").forEach((node) => {
    const item = items[Number(node.dataset.screenshotItem)];
    const preview = node.querySelector("[data-screenshot-reveal]");
    preview?.addEventListener("click", () => {
      void window.vibyraDesktopScreenshot.reveal(item.filePath);
    });
    preview?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") preview.click();
    });
    preview.ondragstart = (event) => {
      setScreenshotPathDragData(event.dataTransfer, preview, item.filePath);
    };
    node.querySelector("[data-screenshot-dismiss]")?.addEventListener("click", () => {
      dismissSavedScreenshot(item.filePath);
    });
    node.querySelector("[data-screenshot-copy]")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      const result = await window.vibyraDesktopScreenshot.copySaved(item.filePath);
      if (!result?.ok) showScreenshotNotice(result?.error || "Copy failed");
    });
  });
  tray.scrollTop = tray.scrollHeight;
}

function setScreenshotPathDragData(dataTransfer, preview, filePath) {
  const path = shellQuotedScreenshotPath(filePath);
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(screenshotPathDragType, path);
  dataTransfer.setData("text/plain", path);
  dataTransfer.setDragImage(preview, Math.floor(preview.offsetWidth / 2), 24);
}

function shellQuotedScreenshotPath(filePath) {
  return `'${String(filePath).replace(/'/g, `'\\''`)}'`;
}

function addSavedScreenshot(item) {
  if (!item?.filePath || !item.thumbnailDataUrl) return;
  screenshotTrayState.items = [
    item,
    ...screenshotTrayState.items.filter((candidate) => candidate.filePath !== item.filePath)
  ].slice(0, 4);
  renderSavedScreenshotTray();
}

function dismissSavedScreenshot(filePath) {
  screenshotTrayState.items = screenshotTrayState.items.filter((item) => item.filePath !== filePath);
  renderSavedScreenshotTray();
}

function clearSavedScreenshotTray() {
  screenshotTrayState.items = [];
  renderSavedScreenshotTray();
}
