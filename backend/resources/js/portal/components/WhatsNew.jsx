import React from "react";
import { latestReleaseFeatures } from "./latestReleaseFeatures";

const FEATURES = [
  ...latestReleaseFeatures,
  {
    title: "GPT-6 Astra is selectable",
    body: "OpenAI's newest model joins the OpenAI wall with its own artwork and a 1.05M token context. On a connected Codex account it launches natively, on its own effort ladder, starting at high.",
    fresh: true,
  },
  {
    title: "0.5.0 closes the 0.4 line",
    body: "One release gathers everything shipped through 0.4.4: Agent Mode and Chat Mode open, decisions that stop work and wait for you, the guided New Project builder, and terminals that stay responsive under load.",
    fresh: false,
  },
  {
    title: "A new website and downloads page",
    body: "The homepage was rebuilt around the workspace tour and playground, and Downloads now reads versions, sizes and checksums from the live release feed with setup guides for Windows and Linux.",
    fresh: false,
  },
  {
    title: "Start a real project from Vibyra",
    body: "Choose a project type and stack, review the exact scaffold command, then let Vibyra build it and open the finished workspace.",
    fresh: false,
  },
  {
    title: "Busy terminals stay responsive",
    body: "Output now follows what the renderer can paint, while generated folders are skipped by the file watcher instead of flooding the app with work.",
    fresh: false,
  },
  {
    title: "Agent and Chat Mode are open",
    body: "Work with a teammate and its own folders, or start a conversation without a project. Decisions remain tied to the task's permitted access.",
    fresh: false,
  },
  {
    title: "Fable 5.1 has its own artwork",
    body: "Claude Fable 5.1 now has a distinct model-wall plate that matches the current icon family instead of borrowing Fable 5's image.",
    fresh: false,
  },
  {
    title: "Ask Vibyra, and it can see your workspace",
    body: "The dock's chat is now an assistant briefed on live state \u2014 what every pane is doing, what just failed, what you have spent \u2014 with credentials stripped before anything is sent.",
    fresh: false,
  },
  {
    title: "Speak to it, and it answers out loud",
    body: "Press the microphone and talk. One ring shows who is speaking: cobalt for you, violet for Vibyra, both driven by real audio rather than decoration.",
    fresh: false,
  },
  {
    title: "The startup splash and project activity are back",
    body: "Three features that went missing when 0.3.5 was branched return here: the splash at launch, seven days of Git activity per project, and the lighter auth backdrop.",
    fresh: false,
  },
  {
    title: "Switching projects is immediate again",
    body: "A suspended pane was redrawing its entire scrollback on every switch. It now draws a bounded tail, and restoring a terminal is unchanged.",
    fresh: false,
  },
  {
    title: "Teammates that remember",
    body: "Give an agent a name, a brief and its own folders, and it keeps all of it \u2014 plus what it has learned \u2014 across every conversation you have with it.",
    fresh: false,
  },
  {
    title: "As many chats as you need",
    body: "One teammate, many conversations. Starting a new one touches nothing else, and all of them share the same brief, memory and skills.",
    fresh: false,
  },
  {
    title: "You decide what leaves the machine",
    body: "Reading inside a folder you granted never asks. Publishing, spending, deleting and anything touching a secret always do \u2014 and what you approved is what runs, even if the agent changes its mind afterwards.",
    fresh: false,
  },
  {
    title: "Work that happens on a schedule",
    body: "A routine opens a fresh chat each time it runs, at the time you set, in the timezone you set. Miss one because the app was shut and it is skipped, never fired in a burst when you come back.",
    fresh: false,
  },
  {
    title: "Teach it once",
    body: "Write down a procedure \u2014 when it applies, what to do, how to know it worked, where to stop \u2014 and hand it to whichever teammates need it. An agent can suggest one; only you install it.",
    fresh: false,
  },
  {
    title: "Updates finish before your workspace opens",
    body: "Launch checks, downloads and installs trusted releases before terminals and projects start, with clear progress and safe recovery controls.",
    fresh: false,
  },
  {
    title: "A proper introduction after every update",
    body: "The new What’s New view explains the release once, in a focused window that is easy to dismiss and never interrupts you twice.",
    fresh: false,
  },
  {
    title: "See the recent story of a project",
    body: "Right-click a project — or press Shift+F10 — to review seven days of Git activity, then give it a clearer name and color.",
    fresh: false,
  },
  {
    title: "Close projects without the risky click",
    body: "A two-step close flow explains what will happen and protects open work from accidental removal.",
    fresh: false,
  },
  {
    title: "Terminal prompts keep their focus",
    body: "Permission requests, update notices, toasts and dialogs return typing to the terminal instead of leaving it unresponsive.",
    fresh: false,
  },
  {
    title: "One stage, split how you like",
    body: "Terminals and preview share the stage instead of replacing each other, and the rail stays put so there is always a way back.",
  },
  {
    title: "Jump anywhere from the command bar",
    body: "Switch project, pane or layout without reaching for the mouse.",
  },
  {
    title: "See your voice",
    body: "Dictation shows a live level meter, so you can tell it is hearing you before you finish the sentence.",
  },
  {
    title: "Carry a conversation between agents",
    body: "Hand what Claude was working on to Codex — or the other way round — without pasting the context yourself.",
  },
  {
    title: "One account per pane",
    body: "Run two providers side by side and see which account each pane is signed in as.",
  },
  {
    title: "Notifications that tell you what they want",
    body: "Every notice now says what it is about and what it needs from you \u2014 a decision, a failure, a warning, work in progress, or just news. A blocked agent can no longer be pushed off screen by three that finished.",
  },
  {
    title: "Answer an agent without leaving what you are doing",
    body: "When Codex, Claude or Gemini asks permission to run a command, the notification shows the command and the answer buttons. Vibyra re-reads the pane before sending anything, so it can never answer a question that has moved on.",
  },
  {
    title: "Updates you can follow",
    body: "Downloads show real progress in one card that becomes \u201cRestart to finish\u201d, and updates finally live in Settings \u2192 Notifications like everything else.",
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
