function bindScreenshotCanvasTools() {
  const canvas = screenshotCanvas();
  if (!canvas || canvas.dataset.screenshotToolsBound) return;
  canvas.dataset.screenshotToolsBound = "1";
  canvas.addEventListener("pointerdown", startScreenshotDrag);
  canvas.addEventListener("pointermove", moveScreenshotDrag);
  canvas.addEventListener("pointerup", finishScreenshotDrag);
  canvas.addEventListener("pointercancel", cancelScreenshotDrag);
}

function startScreenshotDrag(event) {
  if (event.button !== 0) return;
  const point = screenshotPoint(event);
  screenshotCanvas().setPointerCapture?.(event.pointerId);
  screenshotState.crop = screenshotState.tool === "crop" ? null : screenshotState.crop;
  screenshotState.drag = {
    current: point,
    lineWidth: screenshotDisplayLineWidth(screenshotState.tool === "pen" ? 3.5 : 3),
    points: [point],
    start: point,
    tool: screenshotState.tool
  };
  renderScreenshotCanvas();
}

function moveScreenshotDrag(event) {
  const drag = screenshotState.drag;
  if (!drag) return;
  const point = screenshotPoint(event);
  drag.current = point;
  if (drag.tool === "pen") drag.points.push(point);
  renderScreenshotCanvas();
}

function finishScreenshotDrag(event) {
  const drag = screenshotState.drag;
  if (!drag) return;
  drag.current = screenshotPoint(event);
  screenshotCanvas().releasePointerCapture?.(event.pointerId);
  if (drag.tool === "crop") {
    const crop = screenshotRect(drag.start, drag.current);
    screenshotState.crop = crop.width >= 8 && crop.height >= 8 ? crop : null;
    screenshotState.drag = null;
    renderScreenshotCanvas();
    updateScreenshotControls();
    return;
  }
  if (drag.tool === "box") {
    const rect = screenshotRect(drag.start, drag.current);
    if (rect.width >= 4 && rect.height >= 4) {
      commitScreenshotMutation((context) => {
        drawScreenshotBox(context, rect, drag.lineWidth, screenshotState.color);
      });
      return;
    }
  }
  if (drag.tool === "pen" && drag.points.length > 1) {
    commitScreenshotMutation((context) => {
      drawScreenshotPen(context, drag.points, drag.lineWidth, screenshotState.color);
    });
    return;
  }
  screenshotState.drag = null;
  renderScreenshotCanvas();
}

function cancelScreenshotDrag() {
  screenshotState.drag = null;
  renderScreenshotCanvas();
}

function selectScreenshotTool(tool) {
  if (!["crop", "box", "pen"].includes(tool)) return;
  screenshotState.tool = tool;
  screenshotState.drag = null;
  if (tool !== "crop") screenshotState.crop = null;
  updateScreenshotControls();
  renderScreenshotCanvas();
}

function selectScreenshotColor(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  screenshotState.color = color;
  updateScreenshotControls();
}
