import React from "react";

const FEATURES = [
  {
    title: "In-app updates",
    body: "New releases appear inside Vibyra with a one-click update. This is the last build you download by hand.",
    fresh: true,
  },
  {
    title: "Multi-agent terminal grid",
    body: "Run Claude Code, Codex, Gemini and any other AI CLI side by side, each in its own live pane.",
  },
  {
    title: "Rebuilt in Rust",
    body: "Eight or more terminals streaming at once without the window stuttering.",
  },
  {
    title: "Sessions that survive",
    body: "Your panes, layout and scrollback come back exactly as you left them.",
  },
  {
    title: "Workspace tools",
    body: "File browser, SSH sessions, live preview and a built-in screenshot editor on F9.",
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
