import { useCallback, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import {
  nudgeStageRatio,
  previewVisible,
  ratioFromPointer,
  stageColumns,
  terminalsVisible,
  type StageLayout,
} from "../../lib/stageLayout";

export interface StageSplitProps {
  layout: StageLayout;
  ratio: number;
  onRatio: (ratio: number) => void;
  terminals: ReactNode;
  /** Null until the preview has been asked for once; then it stays mounted. */
  preview: ReactNode | null;
}

/**
 * The two project surfaces, side by side.
 *
 * The collapsed side is hidden rather than unmounted, so moving between Split
 * and Preview never restarts a running preview or loses a terminal's scrollback
 * — the thing the old mode switch did every time. Nothing here animates: xterm
 * refits on every resize, so a width transition would refit the whole grid once
 * per frame for the length of it.
 */
export function StageSplit({ layout, ratio, onRatio, terminals, preview }: StageSplitProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const showTerminals = terminalsVisible(layout);
  const showPreview = previewVisible(layout);

  const trackPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const box = stageRef.current?.getBoundingClientRect();
      if (!box) return;
      onRatio(ratioFromPointer(event.clientX, box.left, box.width));
    },
    [onRatio],
  );

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    trackPointer(event);
  };

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    trackPointer(event);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nudgeStageRatio(ratio, event.key);
    if (next === null) return;
    event.preventDefault();
    onRatio(next);
  };

  return (
    <div
      className="stage"
      ref={stageRef}
      style={{ gridTemplateColumns: stageColumns(layout, ratio) }}
    >
      <section className={`stage__pane${showTerminals ? "" : " stage__pane--off"}`}>
        {terminals}
      </section>

      {layout === "split" && (
        <div
          className="stage__divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize terminals and preview"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={25}
          aria-valuemax={80}
          tabIndex={0}
          onPointerDown={beginDrag}
          onPointerMove={drag}
          onKeyDown={onKeyDown}
        />
      )}

      {preview && (
        <section className={`stage__pane${showPreview ? "" : " stage__pane--off"}`}>
          {preview}
        </section>
      )}
    </div>
  );
}
