import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { onVoiceLevel } from "../../ipc/tools";
import { smoothVoiceLevel } from "../../lib/voiceLevel";
import {
  barsFromLevel,
  barsFromSpectrum,
  breatheBars,
  easeBars,
  liftBars,
  restingBars,
  sweepBars,
} from "../../lib/voiceBars";
import { orbMotion, paintOrb, type OrbMode } from "../../lib/voiceOrbPaint";

/**
 * Who is talking, drawn as one ring.
 *
 * The colour carries the meaning: cobalt is you, the violet `--ask` hue is
 * Vibyra. Both are real readings rather than decoration — the listening ring
 * is driven by the microphone level the recorder reports, the speaking ring by
 * the frequency data of the audio actually coming out of the speakers.
 *
 * Canvas rather than elements: a ring re-styled every frame is a lot of layout
 * work to hand WebKit, and this app already watches its renderer budget. One
 * canvas is one paint. The loop runs only while the orb is live.
 *
 * What reduced motion may and may not take away is `orbMotion`, which this
 * component used to decide inline — and decided wrongly, freezing the ring for
 * everyone running maximum performance.
 */

export type { OrbMode };

const SIZE = 104;
/** Decorative drift, radians per second. Zero when motion is reduced. */
const SPIN = 0.12;
/** Reduced motion keeps the reading, at half the frames. */
const REDUCED_FPS = 30;

function hue(styles: CSSStyleDeclaration, mode: OrbMode): string {
  if (mode === "speaking") return styles.getPropertyValue("--ask").trim() || "#9a86f7";
  if (mode === "listening") return styles.getPropertyValue("--accent").trim() || "#5b7cfa";
  return styles.getPropertyValue("--dim").trim() || "#6b7280";
}

export function AskVoiceOrb({ mode, analyser }: { mode: OrbMode; analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const level = useRef(0);

  // The microphone level arrives as events, not on a frame clock, so it is
  // captured into a ref here and merely read by the draw loop below.
  useEffect(() => {
    if (mode !== "listening") return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void onVoiceLevel((next) => {
      if (!disposed) level.current = smoothVoiceLevel(level.current, next);
    }).then((stop) => {
      if (disposed) void stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      level.current = 0;
      unlisten?.();
    };
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || mode === "idle") return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * ratio;
    canvas.height = SIZE * ratio;
    context.scale(ratio, ratio);
    const colour = hue(getComputedStyle(canvas), mode);
    const spectrum = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const started = performance.now();
    let bars = restingBars();
    let frame = 0;
    let painted = 0;

    // The user's own reduced-motion setting (Settings → Performance, which
    // "maximum performance" also turns on) cannot reach a canvas through CSS,
    // so it is honoured here rather than in the sheet. `orbMotion` owns what
    // it costs; on that path the frames are also halved.
    const reduced = document.documentElement.hasAttribute("data-reduce-motion");
    const { live, flourish } = orbMotion(mode, reduced);

    const draw = (now: number) => {
      if (live) frame = requestAnimationFrame(draw);
      const elapsed = now - started;
      if (reduced && now - painted < 1_000 / REDUCED_FPS) return;
      painted = now;

      let target: number[];
      if (mode === "speaking" && analyser && spectrum) {
        analyser.getByteFrequencyData(spectrum);
        target = barsFromSpectrum(spectrum);
      } else if (mode === "listening") {
        target = barsFromLevel(level.current);
      } else if (flourish) {
        target = sweepBars(elapsed);
      } else {
        target = barsFromLevel(0.45);
      }
      if (flourish) target = liftBars(target, breatheBars(elapsed));

      bars = live ? easeBars(bars, target) : target;
      paintOrb(context, {
        bars,
        colour,
        size: SIZE,
        spin: flourish ? (elapsed / 1_000) * SPIN : 0,
      });
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [mode, analyser]);

  if (mode === "idle") return null;

  return (
    <canvas
      className="ask-orb"
      ref={canvasRef}
      style={{ width: SIZE, height: SIZE }}
      aria-hidden="true"
    />
  );
}
