import { useCallback, useRef } from "react";
import type { MouseEvent } from "react";

import { restoreTerminalFocusAfterOverlay } from "../../lib/terminalFocus";
import { useModalFocus } from "../../lib/useModalFocus";
import { useTerminalStore } from "../../state/terminalStore";
import { usePostUpdateChangelog } from "./usePostUpdateChangelog";
import "../../styles/post-update-changelog.css";
import "../../styles/post-update-changelog-content.css";
import "../../styles/post-update-changelog-responsive.css";

export function PostUpdateChangelog() {
  const { content, dismiss } = usePostUpdateChangelog();
  const dialogRef = useRef<HTMLElement>(null);
  const close = useCallback(() => dismiss(), [dismiss]);
  const restoreTerminalFocus = useCallback(() => {
    const focusedId = useTerminalStore.getState().focusedId;
    restoreTerminalFocusAfterOverlay(focusedId, () => useTerminalStore.getState());
  }, []);
  useModalFocus(
    dialogRef,
    content !== null,
    close,
    "#root > :not(.post-update-changelog)",
    restoreTerminalFocus,
  );

  if (!content) return null;
  const closeBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close();
  };

  return (
    <div className="post-update-changelog" onClick={closeBackdrop}>
      <section
        className="post-update-changelog__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-update-changelog-title"
        ref={dialogRef}
      >
        <header className="post-update-changelog__header">
          <div>
            <span className="post-update-changelog__product">Vibyra Desktop</span>
            <h1 id="post-update-changelog-title" tabIndex={-1} data-autofocus>
              {content.title}
            </h1>
            <p>
              Version {content.version} <span aria-hidden="true">·</span>{" "}
              <time dateTime={content.releasedAt}>{content.releasedLabel}</time>
            </p>
          </div>
          <button
            className="post-update-changelog__close"
            type="button"
            aria-label="Close changelog"
            onClick={close}
          ><span aria-hidden="true" /></button>
        </header>

        <div className="post-update-changelog__scroll">
          {content.hero && (
            <figure className="post-update-changelog__art">
              <img
                src={content.hero.src}
                alt={content.hero.alt}
                width="1200"
                height="800"
                decoding="async"
                draggable={false}
              />
              <figcaption>{content.hero.caption}</figcaption>
            </figure>
          )}
          <section className="post-update-changelog__release" aria-labelledby="release-heading">
            <div className="post-update-changelog__section-heading">
              <h2 id="release-heading">{content.sectionLabel}</h2><span />
            </div>
            <div className="post-update-changelog__features">
              {content.features.map((feature) => (
                <article className="post-update-changelog__feature" key={feature.id}>
                  <span className="post-update-changelog__marker" aria-hidden="true">
                    {feature.id}
                  </span>
                  <div><h3>{feature.title}</h3><p>{feature.body}</p></div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <footer className="post-update-changelog__footer">
          <p><span aria-hidden="true" /> You’re up to date</p>
          <button type="button" onClick={close}>Done</button>
        </footer>
      </section>
    </div>
  );
}
