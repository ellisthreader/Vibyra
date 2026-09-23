import { useRef, useState } from "react";

const STEPS = [0.2, 0.4, 0.6, 0.8, 1];
const WORDS = ["Quietest", "Quiet", "Medium", "Loud", "Loudest"];
/** The thumb is 12px, so the travel of its centre is the track minus one thumb. */
const THUMB = 12;

/** Ties go up. The shipped default is 0.5, exactly between step 2 and step 3,
 * and presenting the volume Vibyra chose for you as "Quiet" would misdescribe
 * it — the rounding has to serve the one value that actually lands on a tie. */
function nearestIndex(value: number) {
  let best = 0;
  for (let i = 1; i < STEPS.length; i += 1) {
    if (Math.abs(STEPS[i] - value) <= Math.abs(STEPS[best] - value)) best = i;
  }
  return best;
}

function clampIndex(index: number) {
  return Math.max(0, Math.min(STEPS.length - 1, index));
}

/** Every commit here is an atomic write of settings.json, so the drag keeps its
 * own draft index and only calls `onChange` when the pointer is released. */
export function VolumeSlider({
  value,
  onChange,
  onPreview,
}: {
  value: number;
  onChange: (next: number) => void;
  onPreview?: (next: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<number | null>(null);

  // A settings file holding 0.5 snaps for display only; it is not rewritten
  // just because the page rendered.
  const saved = nearestIndex(value);
  const index = draft ?? saved;

  const commit = (next: number) => {
    // Against the stored value, not the snapped index: 0.5 displays as step 3,
    // so comparing indexes let the slider say "Medium" while the file kept 0.5
    // with no way to reconcile them. Mount still writes nothing — `commit` only
    // ever runs from a gesture.
    if (STEPS[next] !== value) onChange(STEPS[next]);
    onPreview?.(STEPS[next]);
  };

  const indexAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= THUMB) return index;
    const fraction = (clientX - rect.left - THUMB / 2) / (rect.width - THUMB);
    return clampIndex(Math.round(fraction * (STEPS.length - 1)));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    trackRef.current?.focus();
    setDraft(indexAt(event.clientX));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (draft === null) return;
    setDraft(indexAt(event.clientX));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (draft === null) return;
    const next = indexAt(event.clientX);
    setDraft(null);
    commit(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const key = event.key;
    let next = index;
    if (key === "ArrowLeft" || key === "ArrowDown") next = clampIndex(index - 1);
    else if (key === "ArrowRight" || key === "ArrowUp") next = clampIndex(index + 1);
    else if (key === "Home") next = 0;
    else if (key === "End") next = STEPS.length - 1;
    else return;
    event.preventDefault();
    if (next === index) return;
    commit(next);
  };

  const position = index / (STEPS.length - 1);

  return (
    <div className="volslider">
      <QuietIcon />
      <div
        ref={trackRef}
        className="volslider__track"
        style={{ "--volslider-pos": position } as React.CSSProperties}
        data-dragging={draft === null ? undefined : "true"}
        role="slider"
        aria-label="Notification volume"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={index + 1}
        aria-valuetext={WORDS[index]}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className="volslider__rail">
          <div className="volslider__fill" />
          <div className="volslider__thumb" />
        </div>
      </div>
      <LoudIcon />
      <span className="volslider__value">{WORDS[index]}</span>
    </div>
  );
}

// Local to this control on purpose: the shared icon sheet is not the place for
// two glyphs nothing else draws.
const SVG = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function QuietIcon() {
  return (
    <svg className="volslider__glyph" width={13} height={13} {...SVG}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
    </svg>
  );
}

function LoudIcon() {
  return (
    <svg className="volslider__glyph" width={13} height={13} {...SVG}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}
