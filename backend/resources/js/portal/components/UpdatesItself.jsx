import React from "react";

const STEPS = [
  {
    title: "Download once",
    body: "Pick your platform below. This is the only time you need this page.",
  },
  {
    title: "Vibyra updates itself",
    body: "When a new version ships, the app tells you and updates with one click.",
  },
  {
    title: "Always current",
    body: "No reinstalling, no hunting for downloads, no losing your workspace.",
  },
];

/** The single most important thing a first-time visitor should learn: they are
 * not signing up for a manual upgrade treadmill. */
export default function UpdatesItself() {
  return (
    <section className="updates-itself" aria-labelledby="updates-itself-title">
      <h2 id="updates-itself-title">Download once. Never again.</h2>
      <ol className="updates-steps">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="updates-steps__num" aria-hidden="true">{index + 1}</span>
            <strong>{step.title}</strong>
            <span className="updates-steps__body">{step.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
