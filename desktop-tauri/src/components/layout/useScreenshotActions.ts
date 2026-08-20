import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { copyScreenshot, saveScreenshot } from "../../ipc/tools";
import type { Screenshot } from "../../types";
import type { ScreenshotCanvasHandle } from "./ScreenshotCanvas";

export interface ScreenshotNotice {
  message: string;
  tone: "success" | "error";
}

export function useScreenshotActions(
  canvas: RefObject<ScreenshotCanvasHandle | null>,
  addShot: (shot: Screenshot) => void,
  close: () => void,
) {
  const [busy, setBusy] = useState<"copy" | "save" | null>(null);
  const [notice, setNotice] = useState<ScreenshotNotice | null>(null);
  const activeRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    mountedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const showNotice = useCallback((next: ScreenshotNotice) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNotice(next);
    timerRef.current = setTimeout(() => setNotice(null), 2800);
  }, []);

  const run = useCallback(async (kind: "copy" | "save") => {
    if (activeRef.current || !canvas.current) return;
    activeRef.current = true;
    setBusy(kind);
    setNotice(null);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const dataUrl = await canvas.current.dataUrl();
      if (kind === "copy") {
        await copyScreenshot(dataUrl);
        showNotice({ tone: "success", message: "Copied to clipboard" });
      } else {
        addShot(await saveScreenshot(dataUrl));
        close();
      }
    } catch (error) {
      showNotice({ tone: "error", message: `${kind === "copy" ? "Copy" : "Save"} failed: ${String(error)}` });
    } finally {
      activeRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  }, [addShot, canvas, close, showNotice]);

  return {
    busy,
    copy: useCallback(() => run("copy"), [run]),
    notice,
    save: useCallback(() => run("save"), [run]),
  };
}
