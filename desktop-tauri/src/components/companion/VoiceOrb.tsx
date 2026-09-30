import type { TalkPhase } from "../../state/talkStore";

/** The one thing on the screen in voice mode: a circle that is doing something.
 *
 * The sphere is a single element — its light is painted with stacked gradients
 * rather than an overlay, because an overlay inside a clipped round parent is
 * what put a seam across it and leaked a square of blur around it. Everything
 * else exists only for the state it belongs to, so at rest the circle is clean.
 */
export function VoiceOrb({ phase, level }: { phase: TalkPhase; level: number }) {
  return (
    <div
      className="orb"
      data-phase={phase}
      style={{ "--level": level.toFixed(3) } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="orb__glow" />
      {phase === "listening" && (
        <>
          <span className="orb__ripple" />
          <span className="orb__ripple orb__ripple--late" />
        </>
      )}
      <span className="orb__core" />
      {phase === "thinking" && <span className="orb__arc" />}
      {phase === "speaking" && (
        <span className="orb__bars">
          <i /><i /><i /><i /><i />
        </span>
      )}
    </div>
  );
}
