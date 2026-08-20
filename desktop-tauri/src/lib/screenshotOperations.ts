import { drawBox, drawPen, type Point, type Rect } from "./screenshotDrawing";

export type ScreenshotOperation =
  | { type: "box"; rect: Rect; lineWidth: number; color: string }
  | { type: "pen"; points: Point[]; lineWidth: number; color: string }
  | { type: "crop"; rect: Rect };

export function cloneScreenshotCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const target = document.createElement("canvas");
  target.width = source.width;
  target.height = source.height;
  target.getContext("2d")!.drawImage(source, 0, 0);
  return target;
}

function cropScreenshotCanvas(source: HTMLCanvasElement, rect: Rect): HTMLCanvasElement {
  const left = Math.max(0, Math.min(source.width - 1, Math.round(rect.x)));
  const top = Math.max(0, Math.min(source.height - 1, Math.round(rect.y)));
  const right = Math.max(left + 1, Math.min(source.width, Math.round(rect.x + rect.width)));
  const bottom = Math.max(top + 1, Math.min(source.height, Math.round(rect.y + rect.height)));
  const target = document.createElement("canvas");
  target.width = right - left;
  target.height = bottom - top;
  target.getContext("2d")!.drawImage(
    source,
    left,
    top,
    target.width,
    target.height,
    0,
    0,
    target.width,
    target.height,
  );
  return target;
}

export function replayScreenshotOperations(
  base: HTMLCanvasElement,
  operations: ScreenshotOperation[],
): HTMLCanvasElement {
  let target = cloneScreenshotCanvas(base);
  for (const operation of operations) {
    target = applyScreenshotOperation(target, operation);
  }
  return target;
}

export function applyScreenshotOperation(
  source: HTMLCanvasElement,
  operation: ScreenshotOperation,
): HTMLCanvasElement {
  if (operation.type === "crop") return cropScreenshotCanvas(source, operation.rect);
  const context = source.getContext("2d")!;
  if (operation.type === "box") {
    drawBox(context, operation.rect, operation.lineWidth, operation.color);
  } else {
    drawPen(context, operation.points, operation.lineWidth, operation.color);
  }
  return source;
}

function screenshotBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The screenshot could not be encoded."));
    }, "image/png");
  });
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The screenshot could not be read."));
    reader.readAsDataURL(blob);
  });
}

export async function exportScreenshotDataUrl(
  source: HTMLCanvasElement,
  selection: Rect | null,
): Promise<string> {
  const target = selection ? cropScreenshotCanvas(source, selection) : source;
  return blobDataUrl(await screenshotBlob(target));
}
