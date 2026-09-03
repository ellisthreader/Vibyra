import type { ReactNode } from "react";

/**
 * The head every panel opens with: what this is, one line of what it does and
 * what its limits are, and the panel's own primary action.
 *
 * One component rather than a convention, because the four panels drifted:
 * two put their action above the heading, one buried it under a paragraph,
 * and the fourth had none. A shared head is what makes moving between them
 * feel like one product.
 */
export function PanelHead({
  title,
  blurb,
  actions,
}: {
  title: string;
  blurb: string;
  actions?: ReactNode;
}) {
  return (
    <header className="panel__head">
      <div className="panel__heading">
        <h2>{title}</h2>
        <p>{blurb}</p>
      </div>
      {actions && <div className="panel__actions">{actions}</div>}
    </header>
  );
}
