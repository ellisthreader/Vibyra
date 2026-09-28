import React from "react";
import { motion } from "motion/react";
import { Container, Section } from "../ui.jsx";
import { Stagger, hoverLift, riseItem } from "../motion.jsx";

const OUTCOMES = [
  {
    title: "Keep work moving",
    body: "Continue project-bound work away from the desk — the same chat, context, and history on both devices.",
  },
  {
    title: "See what changed",
    body: "Review approvals, changed files, and previews before accepting any work on your machine.",
  },
  {
    title: "Use the right workspace",
    body: "Supported providers, independent agents, or coordinated teams — orchestrated from the desktop.",
  },
];

export function Outcomes() {
  return (
    <Section>
      <Container>
        <Stagger className="grid gap-5 md:grid-cols-3" stagger={0.12}>
          {OUTCOMES.map((outcome) => (
            <motion.div
              key={outcome.title}
              variants={riseItem}
              {...hoverLift}
              className="rounded-2xl border border-line bg-surface px-7 py-8 transition-colors hover:border-line-strong"
            >
              <h3 className="mb-2.5 text-[19px] font-bold tracking-tight">{outcome.title}</h3>
              <p className="text-[15px] text-ink-muted">{outcome.body}</p>
            </motion.div>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}
