// The Fleet level's masthead.
//
// No live counts and no controls up here — Ellis's call (2026-08-29): the
// "6 workspaces · 3 ready" line read as jargon, the rows one glance below
// already answer both numbers, and `useReviewWatch` keeps everything current
// so a manual refresh icon was a control without a job. What earns the space
// instead is the one sentence a new user needs before the list makes sense:
// these are isolated copies, and nothing has touched the project yet.
export function ReviewFleetHeader() {
  return (
    <header className="review-head review-head--fleet">
      <h3 className="review-head__title">Your agents&rsquo; work</h3>
      <p className="review-head__sub">Each one works in its own safe copy of your project.</p>
    </header>
  );
}
