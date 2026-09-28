import React from "react";

/** Says plainly that this is beta, before anyone downloads it. Deliberately a
 * bordered strip rather than a filled warning panel — honest, not alarming. */
export default function BetaBanner() {
  return (
    <aside className="beta-banner" role="note">
      <span className="beta-banner__tag">Beta</span>
      <p>
        Vibyra Desktop is early software. Expect rough edges and the occasional bug.
        Your terminals and layout are saved locally, but please don’t depend on it for
        critical work yet. Free while in beta — no account needed.
      </p>
    </aside>
  );
}
