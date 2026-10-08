import { screenshotRect, type Point, type Rect } from "./screenshotDrawing";

export type CropDragMode = "new" | "move" | "nw" | "ne" | "se" | "sw";

function near(point: Point, x: number, y: number, radius: number): boolean {
  return Math.abs(point.x - x) <= radius && Math.abs(point.y - y) <= radius;
}

function inside(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function cropHitTarget(point: Point, rect: Rect, radius: number): CropDragMode {
  if (near(point, rect.x, rect.y, radius)) return "nw";
  if (near(point, rect.x + rect.width, rect.y, radius)) return "ne";
  if (near(point, rect.x + rect.width, rect.y + rect.height, radius)) return "se";
  if (near(point, rect.x, rect.y + rect.height, radius)) return "sw";
  return inside(point, rect) ? "move" : "new";
}

function bounded(point: Point, width: number, height: number): Point {
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y)),
  };
}

export function updateCropRect(
  mode: CropDragMode,
  start: Point,
  current: Point,
  initial: Rect | null,
  width: number,
  height: number,
): Rect {
  const point = bounded(current, width, height);
  if (mode === "new" || !initial) return screenshotRect(start, point);
  if (mode === "move") {
    return {
      ...initial,
      x: Math.max(0, Math.min(width - initial.width, initial.x + point.x - start.x)),
      y: Math.max(0, Math.min(height - initial.height, initial.y + point.y - start.y)),
    };
  }
  const opposite = {
    nw: { x: initial.x + initial.width, y: initial.y + initial.height },
    ne: { x: initial.x, y: initial.y + initial.height },
    se: { x: initial.x, y: initial.y },
    sw: { x: initial.x + initial.width, y: initial.y },
  }[mode];
  return screenshotRect(opposite, point);
}

export function cropCursor(mode: CropDragMode): string {
  if (mode === "move") return "move";
  if (mode === "nw" || mode === "se") return "nwse-resize";
  if (mode === "ne" || mode === "sw") return "nesw-resize";
  return "crosshair";
}
