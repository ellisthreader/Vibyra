import React from "react";
import { motion } from "motion/react";
import { Container, Eyebrow, Section, SectionTitle } from "../ui.jsx";
import { FadeUp, Stagger, riseItem } from "../motion.jsx";

const GROUPS = [
  ["Connect", ["Same-account phone pairing", "Desktop approval and phone confirmation", "Project discovery and Browse PC", "Signed-in device management"]],
  ["Build", ["Independent AI terminals", "Coordinated agent teams", "Focus and grid layouts", "Safe branches or shared folders", "Explicit full-access opt-in"]],
  ["Work", ["Monaco project editor", "Live preview with device presets", "Preview diagnostics and Fix with AI", "Screenshot capture and annotation", "Project and Full PC scopes"]],
  ["Talk + remember", ["Vibyra AI chat", "Push-to-talk conversation", "Terminal voice dictation", "Project memory graph", "Obsidian and Markdown import"]],
  ["Review from phone", ["Project-aware AI chat", "Approve, deny, and undo changes", "Live and generated previews", "Files, images, research, and analysis", "Plan, Debug, Review, Design, Ship, Publish, Explain"]],
  ["Share + manage", ["Project publishing and hosted demos", "Explore, likes, comments, bookmarks, and reports", "Credits, top-ups, and plan limits", "Stripe, Apple, and Google billing paths", "App lock, language, support, referrals, and account controls"]],
];

export default function CapabilityAtlas() {
  return (
    <Section id="capabilities">
      <Container className="capability-stage">
        <div className="capability-stage__media" aria-hidden="true">
          <img src="/media/homepage/vibyra-cobalt-stage.png" alt="" loading="lazy" />
        </div>
        <div className="capability-stage__content">
          <FadeUp>
            <Eyebrow>Everything in one system</Eyebrow>
            <SectionTitle>From first prompt to published result.</SectionTitle>
            <p className="max-w-[62ch] text-lg text-ink-muted">
              The headline workflow stays simple. The depth is here when you need it—across
              devices, terminals, voice, memory, previews, publishing, billing, and control.
            </p>
          </FadeUp>
          <Stagger className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2 xl:grid-cols-3" stagger={0.05}>
            {GROUPS.map(([title, items]) => (
              <motion.section key={title} variants={riseItem} className="bg-canvas-raised/95 p-6">
                <h3 className="mb-4 text-lg font-bold">{title}</h3>
                <ul className="space-y-2.5">
                  {items.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
                      <span className="mt-[9px] size-1 shrink-0 rounded-full bg-violet" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.section>
            ))}
          </Stagger>
          <p className="mt-5 text-xs leading-relaxed text-ink-muted">
            Availability can vary by platform, runtime, provider account, plan, and release state.
            Vibyra Desktop is required for local projects.
          </p>
        </div>
      </Container>
    </Section>
  );
}
