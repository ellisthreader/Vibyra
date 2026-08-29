import type { Collision } from "../../../lib/reviewCollisions";
import { useReviewStore } from "../../../state/reviewStore";

interface Props {
  collision: Collision;
}

/**
 * One contested path: who is in it, and a way in.
 *
 * The action deliberately says `Open <workspace>` rather than `Compare`. A
 * real side-by-side of two worktrees' versions of a file is a later phase, and
 * a button promising a comparison that turns out to be one workspace's
 * changeset is how a user stops trusting the labels on this surface. It opens
 * the first party's changes, and it says so.
 */
export function ReviewRadarRow({ collision }: Props) {
  const select = useReviewStore((state) => state.select);
  // Orphans never reach the radar — the derivation drops them before it
  // intersects — but the party type allows a missing pane, so the button is
  // offered only when there is somewhere for it to go.
  const target = collision.workspaces.find((party) => party.paneId !== null) ?? null;

  return (
    <li className={`radar-row radar-row--${collision.level}`}>
      <code className="radar-row__path" title={collision.path}>
        {collision.path}
      </code>
      <p className="radar-row__parties">
        {collision.workspaces.map((party) => (
          <span key={party.key} className="radar-row__party">
            {party.label}
            {party.landed && <em className="radar-row__landed">already in your project</em>}
          </span>
        ))}
      </p>
      {target && (
        <button
          type="button"
          className="radar-row__go"
          title={`Opens ${target.label}'s changes. A side-by-side of both versions is not built yet.`}
          onClick={() => select(target.paneId)}
        >
          Open {target.label}
        </button>
      )}
    </li>
  );
}
