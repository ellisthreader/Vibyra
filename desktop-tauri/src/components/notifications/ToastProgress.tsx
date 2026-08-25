import type { CSSProperties } from "react";

/**
 * The bar under a `busy` toast.
 *
 * Deliberately not the timer bar: that one drains right-to-left to say "this is
 * about to leave", and reusing it for work in progress would read as a
 * countdown to nothing. This one fills, and a `busy` toast has no lifetime at
 * all — it is replaced in place by the `done` or `fail` that ends it.
 *
 * A server that omits `content-length` leaves the percentage unknown, which is
 * common enough to be a first-class state rather than a zero-width bar.
 */
export function ToastProgress({ percent }: { percent?: number }) {
  const known = typeof percent === "number" && Number.isFinite(percent);
  const clamped = known ? Math.min(100, Math.max(0, percent)) : 0;

  return (
    <span
      className={`vtoast__progress${known ? "" : " vtoast__progress--unknown"}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? Math.round(clamped) : undefined}
    >
      <i style={{ "--vtoast-pct": `${clamped}%` } as CSSProperties} />
    </span>
  );
}
