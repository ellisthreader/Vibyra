function reloadDesktopWindow(window) {
  if (!window || window.isDestroyed()) return;
  window.webContents.reloadIgnoringCache();
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

function bindDesktopReloadShortcuts(window) {
  window.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "");
    const reloadKey = key === "F5"
      || key.toLowerCase() === "r" && (input.control || input.meta);
    if (!reloadKey || input.type !== "keyDown") return;
    event.preventDefault();
    reloadDesktopWindow(window);
  });
}

module.exports = { bindDesktopReloadShortcuts, reloadDesktopWindow };
