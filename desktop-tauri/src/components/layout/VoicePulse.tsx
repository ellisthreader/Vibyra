import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { onVoiceLevel } from "../../ipc/tools";
import { pulseShape, smoothVoiceLevel, VOICE_LEVEL_STALE_MS } from "../../lib/voiceLevel";

/**
 * The dictation meter: a dot that swells with how loudly you are speaking.
 *
 * Deliberately holds no React state. Levels arrive twenty times a second, and
 * a re-render each time would cost more than everything this component draws;
 * the handler writes two transforms straight to the DOM instead, and the CSS
 * transition on them lets the compositor fill in the frames between events.
 */
export function VoicePulse() {
  const root = useRef<HTMLSpanElement>(null);
  const halo = useRef<HTMLSpanElement>(null);
  const core = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let level = 0;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;

    // If no level ever arrives — an older build, or a recorder whose file
    // could not be read — fall back to the idle animation. A meter frozen at
    // nothing reads as a broken microphone, which is the wrong thing to say.
    const idle = window.setTimeout(() => {
      root.current?.classList.add("voice-pulse--idle");
    }, VOICE_LEVEL_STALE_MS);

    void onVoiceLevel((next) => {
      if (disposed) return;
      window.clearTimeout(idle);
      root.current?.classList.remove("voice-pulse--idle");
      level = smoothVoiceLevel(level, next);
      const shape = pulseShape(level);
      if (halo.current) {
        halo.current.style.transform = `scale(${shape.halo.toFixed(3)})`;
        halo.current.style.opacity = shape.opacity.toFixed(3);
      }
      if (core.current) {
        core.current.style.transform = `scale(${shape.core.toFixed(3)})`;
      }
    }).then((stop) => {
      // The listener resolves a tick late; a HUD dismissed inside that tick
      // would otherwise leave it attached for the life of the window.
      if (disposed) void stop();
      else unlisten = stop;
    });

    return () => {
      disposed = true;
      window.clearTimeout(idle);
      unlisten?.();
    };
  }, []);

  return (
    <span className="voice-pulse" ref={root} aria-hidden="true">
      <span className="voice-pulse__halo" ref={halo} />
      <span className="voice-pulse__core" ref={core} />
    </span>
  );
}
