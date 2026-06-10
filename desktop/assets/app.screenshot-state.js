const screenshotState = {
  color: "#ff6677",
  crop: null,
  documentCanvas: null,
  drag: null,
  history: [],
  originalDataUrl: "",
  tool: "crop"
};

function screenshotCanvas() {
  return document.querySelector("[data-screenshot-canvas]");
}

function screenshotDocumentCanvas() {
  if (!screenshotState.documentCanvas) {
    screenshotState.documentCanvas = document.createElement("canvas");
  }
  return screenshotState.documentCanvas;
}

async function loadScreenshotDocument(dataUrl, resetOriginal = false) {
  const image = await screenshotLoadImage(dataUrl);
  const canvas = screenshotDocumentCanvas();
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  canvas.getContext("2d").drawImage(image, 0, 0);
  if (resetOriginal) {
    screenshotState.originalDataUrl = dataUrl;
    screenshotState.history = [dataUrl];
  }
  screenshotState.crop = null;
  screenshotState.drag = null;
  renderScreenshotCanvas();
  updateScreenshotControls();
}

function screenshotLoadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Screenshot could not be opened."));
    image.src = dataUrl;
  });
}

function renderScreenshotCanvas() {
  const canvas = screenshotCanvas();
  const source = screenshotState.documentCanvas;
  if (!canvas || !source?.width) return;
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0);
  drawScreenshotPreview(context);
}

function drawScreenshotPreview(context) {
  const drag = screenshotState.drag;
  if (drag?.tool === "pen" && drag.points.length > 1) {
    drawScreenshotPen(context, drag.points, drag.lineWidth, screenshotState.color);
  }
  if (drag?.tool === "box") {
    drawScreenshotBox(context, screenshotRect(drag.start, drag.current), drag.lineWidth, screenshotState.color);
  }
  const crop = drag?.tool === "crop"
    ? screenshotRect(drag.start, drag.current)
    : screenshotState.crop;
  if (crop) drawScreenshotCrop(context, crop);
}

function drawScreenshotPen(context, points, lineWidth, color) {
  context.save();
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = lineWidth;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.stroke();
  context.restore();
}

function drawScreenshotBox(context, rect, lineWidth, color) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.restore();
}

function drawScreenshotCrop(context, rect) {
  const canvas = context.canvas;
  context.save();
  context.fillStyle = "rgba(3, 3, 8, 0.58)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.clearRect(rect.x, rect.y, rect.width, rect.height);
  context.drawImage(
    screenshotState.documentCanvas,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    rect.x,
    rect.y,
    rect.width,
    rect.height
  );
  context.strokeStyle = "#ffffff";
  context.lineWidth = screenshotDisplayLineWidth(1.5);
  context.setLineDash([screenshotDisplayLineWidth(6), screenshotDisplayLineWidth(4)]);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.restore();
}

function screenshotPoint(event) {
  const canvas = screenshotCanvas();
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)),
    y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height))
  };
}

function screenshotRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function screenshotDisplayLineWidth(cssPixels = 3) {
  const canvas = screenshotCanvas();
  const rect = canvas?.getBoundingClientRect();
  return rect?.width ? Math.max(1, cssPixels * canvas.width / rect.width) : cssPixels;
}

function commitScreenshotMutation(draw) {
  const canvas = screenshotDocumentCanvas();
  draw(canvas.getContext("2d"), canvas);
  screenshotState.history.push(canvas.toDataURL("image/png"));
  screenshotState.history = screenshotState.history.slice(-6);
  screenshotState.crop = null;
  screenshotState.drag = null;
  renderScreenshotCanvas();
  updateScreenshotControls();
}

async function undoScreenshotMutation() {
  if (screenshotState.history.length <= 1) return;
  screenshotState.history.pop();
  await loadScreenshotDocument(screenshotState.history.at(-1));
}

async function resetScreenshotDocument() {
  if (!screenshotState.originalDataUrl) return;
  await loadScreenshotDocument(screenshotState.originalDataUrl, true);
}

async function applyScreenshotCrop() {
  const crop = screenshotState.crop;
  const source = screenshotState.documentCanvas;
  if (!crop || crop.width < 8 || crop.height < 8 || !source) return;
  const next = document.createElement("canvas");
  next.width = Math.max(1, Math.round(crop.width));
  next.height = Math.max(1, Math.round(crop.height));
  next.getContext("2d").drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    next.width,
    next.height
  );
  screenshotState.documentCanvas = next;
  screenshotState.history.push(next.toDataURL("image/png"));
  screenshotState.history = screenshotState.history.slice(-6);
  screenshotState.crop = null;
  renderScreenshotCanvas();
  updateScreenshotControls();
}

function screenshotDataUrl() {
  return screenshotState.documentCanvas?.toDataURL("image/png") || "";
}
