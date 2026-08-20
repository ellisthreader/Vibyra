export type ScreenshotTool = "crop" | "box" | "pen";

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Maps a pointer event onto document (full capture resolution) coordinates.
 * The caller passes the already-measured element rect: reading it per pointer
 * event forces a synchronous layout on every mouse move.
 */
export function screenshotPoint(bounds: DOMRect, document: Size, event: PointerEvent): Point {
  const width = bounds.width || document.width;
  const height = bounds.height || document.height;
  return {
    x: Math.max(0, Math.min(document.width, ((event.clientX - bounds.left) * document.width) / width)),
    y: Math.max(0, Math.min(document.height, ((event.clientY - bounds.top) * document.height) / height)),
  };
}

export function screenshotRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/** Converts a CSS-pixel thickness into document-space units. */
export function documentLineWidth(bounds: DOMRect, document: Size, cssPixels: number): number {
  return bounds.width ? Math.max(1, (cssPixels * document.width) / bounds.width) : cssPixels;
}

export function drawPen(
  context: CanvasRenderingContext2D,
  points: Point[],
  lineWidth: number,
  color: string,
): void {
  if (points.length < 2) return;
  context.save();
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = lineWidth;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.stroke();
  context.restore();
}

export function drawBox(
  context: CanvasRenderingContext2D,
  rect: Rect,
  lineWidth: number,
  color: string,
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.restore();
}

/**
 * Draws the crop chrome onto the transparent overlay layer. The selection is
 * punched out with `clearRect` so the untouched image layer shows through —
 * re-blitting the capture through the selection every frame is what made
 * dragging a crop feel heavy on software-composited WebKit.
 */
export function drawCrop(
  context: CanvasRenderingContext2D,
  document: Size,
  rect: Rect,
  lineWidth: number,
  active: boolean,
): void {
  context.save();
  if (active) {
    context.fillStyle = "rgba(3, 4, 8, 0.62)";
    context.fillRect(0, 0, document.width, document.height);
    context.clearRect(rect.x, rect.y, rect.width, rect.height);
  }
  context.strokeStyle = "rgba(4, 6, 12, 0.8)";
  context.lineWidth = lineWidth * 3;
  context.setLineDash([]);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.strokeStyle = "#fff";
  context.lineWidth = lineWidth;
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  if (active) {
    const size = Math.max(lineWidth * 5, 5);
    context.fillStyle = "#fff";
    context.strokeStyle = "#315bd8";
    context.lineWidth = lineWidth;
    for (const [x, y] of [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x + rect.width, rect.y + rect.height],
      [rect.x, rect.y + rect.height],
    ]) {
      context.fillRect(x - size / 2, y - size / 2, size, size);
      context.strokeRect(x - size / 2, y - size / 2, size, size);
    }
  }
  context.restore();
}
