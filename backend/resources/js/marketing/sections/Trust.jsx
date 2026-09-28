import React from "react";
import { motion } from "motion/react";
import { Container, Eyebrow, Section, SectionTitle } from "../ui.jsx";
import { FadeUp, Stagger, riseItem } from "../motion.jsx";

const TRUST = [
  {
    title: "Two-sided pairing",
    body: "Phone and desktop connect only on the same account, with approval on both devices.",
  },
  {
    title: "Approval gates",
    body: "Sensitive local actions — file edits, preview servers, connections — require explicit permission.",
  },
  {
    title: "Device management",
    body: "App lock and signed-in-device controls let you see and revoke every session.",
  },
  {
    title: "Clear boundaries",
    body: "Local files and commands stay on your computer. Vibyra tells you when a workflow uses cloud AI.",
  },
];

export function Trust() {
  return (
    <Section id="trust">
      <Container narrow>
        <FadeUp>
          <Eyebrow>Control &amp; trust</Eyebrow>
          <SectionTitle className="mb-2">Explicit by design.</SectionTitle>
        </FadeUp>
      </Container>
      <Container>
        <Stagger
          className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 xl:grid-cols-4"
          stagger={0.1}
        >
          {TRUST.map((item) => (
            <motion.div
              key={item.title}
              variants={riseItem}
              className="bg-canvas-raised px-6 py-7 transition-colors hover:bg-canvas-raised/60"
            >
              <h3 className="mb-2.5 text-[16.5px] font-bold">{item.title}</h3>
              <p className="text-[14.5px] text-ink-muted">{item.body}</p>
            </motion.div>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}
