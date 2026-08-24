import React from "react";

const FEATURES = [
  {
    title: "Typing that keeps up",
    body: "Your keystrokes reach the screen within a frame, even while agents stream output in other panes.",
    fresh: true,
  },
  {
    title: "Updates from Settings",
    body: "See your version and check for the latest release any time in Settings → Updates.",
    fresh: true,
  },
  {
    title: "Terminal performance fixed",
    body: "Correct character spacing, responsive typing and accelerated rendering are restored.",
  },
  {
    title: "Lower CPU usage",
    body: "Terminals stay on the WebGL renderer and avoid layout work on every keystroke.",
  },
  {
    title: "Reliable fast input",
    body: "Keyboard, paste, drag and dictation input remain in exact order, even during rapid bursts.",
  },
  {
    title: "Sessions that survive",
    body: "Your panes, layout and scrollback come back exactly as you left them.",
  },
  {
    title: "In-app updates",
    body: "New releases appear inside Vibyra and preserve terminal state before restarting.",
  },
  {
    title: "Obsidian memory",
    body: "Point Vibyra at a vault and your agents can read and write your own notes.",
  },
];

/** Version comes from the release feed rather than a constant, so this heading
 * cannot drift from whatever is actually being served. */
export default function WhatsNew({ version }) {
  return (
    <section className="whats-new" aria-labelledby="whats-new-title">
      <h2 id="whats-new-title">
        What you get{version ? <span className="whats-new__version">Beta {version}</span> : null}
      </h2>
      <ul className="feature-grid">
        {FEATURES.map((feature) => (
          <li key={feature.title} className={feature.fresh ? "feature--fresh" : undefined}>
            <strong>
              {feature.title}
              {feature.fresh && <span className="feature__flag">New</span>}
            </strong>
            <span>{feature.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
