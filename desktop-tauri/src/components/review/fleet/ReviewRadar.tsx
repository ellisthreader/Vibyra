import type { Collision } from "../../../lib/reviewCollisions";
import { WarnIcon } from "../../common/StatusIcons";
import { ReviewRadarRow } from "./ReviewRadarRow";

interface Props {
  /** Already filtered to overlap-and-worse by `radarCollisions`. */
  collisions: Collision[];
}

/**
 * The collision radar: the one alarm on an otherwise quiet screen.
 *
 * It exists at all only when something is genuinely contested, and it never
 * shows a `touch` — same file, different functions, which is what parallel
 * work looks like when it is going well. A radar that reported those would be
 * lit permanently, and a permanently lit radar is one the user scrolls past.
 *
 * It also updates while the agents are still running. That is the point of the
 * feature: you learn about the collision at minute two, not at merge time.
 */
export function ReviewRadar({ collisions }: Props) {
  if (collisions.length === 0) return null;
  const conflicted = collisions.some((collision) => collision.level === "conflict");

  return (
    <section
      className={`fleet-radar ${conflicted ? "fleet-radar--conflict" : ""}`}
      aria-labelledby="fleet-radar-head"
    >
      <h3 className="fleet-radar__head" id="fleet-radar-head">
        <WarnIcon size={12} />
        {collisions.length === 1 ? "1 contested file" : `${collisions.length} contested files`}
      </h3>
      <ul className="fleet-radar__list">
        {collisions.map((collision) => (
          <ReviewRadarRow key={collision.path} collision={collision} />
        ))}
      </ul>
    </section>
  );
}
