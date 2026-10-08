import { openNeedsYou, useNeedsYouTotal } from "../../lib/needsYou";
import { useProjectStore } from "../../state/projectStore";
import { HomeIcon } from "../common/Icons";

function InboxIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 9l2-5.5h8L14 9v4H2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M2 9h3.5l1 1.5h3L10.5 9H14" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>;
}

/** Home and Needs you: the two places above the project list. */
export function FrameNav() {
  const view = useProjectStore((s) => s.view);
  const waiting = useNeedsYouTotal();
  const label = waiting ? `Needs you, ${waiting} waiting` : "Needs you, nothing waiting";
  const row = (active: boolean) => `pstrip__row ${active ? "pstrip__row--active" : ""}`;
  return <nav className="frame-nav" aria-label="Places">
    <button type="button" className={row(view === "home")} aria-current={view === "home" ? "page" : undefined}
      onClick={() => useProjectStore.getState().goHome()}>
      <HomeIcon size={15} /><span className="pstrip__name">Home</span>
    </button>
    <button type="button" className={row(view === "needs-you")} aria-current={view === "needs-you" ? "page" : undefined}
      aria-label={label} onClick={openNeedsYou}>
      <InboxIcon /><span className="pstrip__name">Needs you</span>
      {waiting > 0 && <span className="frame-badge">{waiting}</span>}
    </button>
  </nav>;
}
