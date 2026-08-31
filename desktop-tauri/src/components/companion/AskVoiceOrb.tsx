import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { onVoiceLevel } from "../../ipc/tools";
import { smoothVoiceLevel } from "../../lib/voiceLevel";
import {
  BAR_COUNT,
  barsFromLevel,
  barsFromSpectrum,
  easeBars,
  restingBars,
  sweepBars,
} from "../../lib/voiceBars";

/**
 * Who is talking, drawn as one ring.
 *
 * The colour carries the meaning: cobalt is you, the violet `--ask` hue is
 * Vibyra. Both are real readings rather than decoration — the listening ring
 * is driven by the microphone level the recorder reports, the speaking ring by
 * the frequency data of the audio actually coming out of the speakers.
 *
 * Canvas rather than elements: fifty-six bars re-styled every frame is a lot
 * of layout work to hand WebKit, and this app already watches its renderer
 * budget. One canvas is one paint. The loop runs only while the orb is live.
 */

export type OrbMode = "idle" | "listening" | "thinking" | "speaking";

const SIZE = 128;
const INNER = 27;
const REACH = 25;

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
    const styles = getComputedStyle(canvas);
    const colour = hue(styles, mode);
    const spectrum = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const started = performance.now();
    let bars = restingBars();
    let frame = 0;

    // The user's own reduced-motion setting (Settings → Performance) cannot
    // reach a canvas through CSS, so it is honoured here: one static ring
    // instead of a loop. The state is still legible from the colour and the
    // caption beside it.
    const still = document.documentElement.hasAttribute("data-reduce-motion");

    const draw = (now: number) => {
      if (!still) frame = requestAnimationFrame(draw);
      let target: number[];
      if (still) {
        target = barsFromLevel(0.45);
      } else if (mode === "speaking" && analyser && spectrum) {
        analyser.getByteFrequencyData(spectrum);
        target = barsFromSpectrum(spectrum);
      } else if (mode === "listening") {
        target = barsFromLevel(level.current);
      } else {
        target = sweepBars(now - started);
      }
      bars = easeBars(bars, target);

      const mid = SIZE / 2;
      context.clearRect(0, 0, SIZE, SIZE);

      const loudest = bars.reduce((peak, value) => (value > peak ? value : peak), 0);
      const glow = context.createRadialGradient(mid, mid, 2, mid, mid, INNER + REACH);
      glow.addColorStop(0, colour);
      glow.addColorStop(1, "transparent");
      context.globalAlpha = 0.1 + loudest * 0.22;
      context.fillStyle = glow;
      context.fillRect(0, 0, SIZE, SIZE);

      context.globalAlpha = 1;
      context.strokeStyle = colour;
      context.lineCap = "round";
      context.lineWidth = 2.2;
      for (let index = 0; index < BAR_COUNT; index += 1) {
        const angle = (index / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
        const reach = INNER + bars[index] * REACH;
        context.globalAlpha = 0.32 + bars[index] * 0.68;
        context.beginPath();
        context.moveTo(mid + Math.cos(angle) * INNER, mid + Math.sin(angle) * INNER);
        context.lineTo(mid + Math.cos(angle) * reach, mid + Math.sin(angle) * reach);
        context.stroke();
      }

      context.globalAlpha = 0.5 + loudest * 0.5;
      context.lineWidth = 1;
      context.beginPath();
      context.arc(mid, mid, INNER - 7 + loudest * 3, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    };

    if (still) bars = barsFromLevel(0.45);
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
