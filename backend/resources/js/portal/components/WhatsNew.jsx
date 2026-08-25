import React from "react";

const FEATURES = [
  {
    title: "Notifications that tell you what they want",
    body: "Every notice now says what it is about and what it needs from you \u2014 a decision, a failure, a warning, work in progress, or just news. A blocked agent can no longer be pushed off screen by three that finished.",
    fresh: true,
  },
  {
    title: "Answer an agent without leaving what you are doing",
    body: "When Codex, Claude or Gemini asks permission to run a command, the notification shows the command and the answer buttons. Vibyra re-reads the pane before sending anything, so it can never answer a question that has moved on.",
    fresh: true,
  },
  {
    title: "Updates you can follow",
    body: "Downloads show real progress in one card that becomes \u201cRestart to finish\u201d, and updates finally live in Settings \u2192 Notifications like everything else.",
    fresh: true,
  },
  {
    title: "A Performance home in Settings",
    body: "See what Vibyra is using right now — graphics path, CPU, memory — and every lever that changes it, in one place.",
  },
  {
    title: "Graphics that heal themselves",
    body: "Installs left on a slower GPU mode are moved back to the fast path automatically, and the app never suggests a mode your hardware runs worse.",
  },
  {
    title: "Typing that keeps up",
    body: "Your keystrokes reach the screen within a frame, even while agents stream output in other panes.",
  },
  {
    title: "Updates from Settings",
    body: "See your version and check for the latest release any time in Settings → Updates.",
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
