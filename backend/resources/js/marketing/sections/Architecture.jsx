import React from "react";
import { motion } from "motion/react";
import { Container, Section, SectionTitle } from "../ui.jsx";
import { FadeUp, Stagger, hoverLift } from "../motion.jsx";

const ARCH_NODES = [
  {
    label: "Phone",
    desc: "Prompts, review, approvals, and live preview — wherever you are.",
    main: false,
  },
  {
    label: "Desktop",
    desc: "Your real projects, files, terminals, and local runtimes stay on your computer.",
    main: true,
  },
  {
    label: "Vibyra account",
    desc: "Sign-in, billing, sync, supported AI routing, memory, and publishing.",
    main: false,
  },
];

const CONNECTOR_VARIANTS = {
  hidden: { opacity: 0, scale: 0.6 },
  show: { opacity: 1, scale: 1 },
};

const NODE_VARIANTS = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6 } },
};

export function Architecture() {
  return (
    <Section id="architecture">
      <Container narrow>
        <FadeUp>
          <SectionTitle>
            Your computer does the work.
            <br />
            Your phone keeps you in control.
          </SectionTitle>
        </FadeUp>
      </Container>
      <Container>
        <Stagger className="mt-6 grid items-stretch gap-5 md:grid-cols-[1fr_auto_1.2fr_auto_1fr]" stagger={0.14}>
          {ARCH_NODES.map((node, i) => (
            <React.Fragment key={node.label}>
              {i > 0 && (
                <motion.div
                  variants={CONNECTOR_VARIANTS}
                  className="flex items-center justify-center"
                  aria-hidden="true"
                >
                  <span className="block h-7 w-0.5 rounded bg-gradient-to-b from-violet to-pink md:h-0.5 md:w-9 md:bg-gradient-to-r" />
                </motion.div>
              )}
              <motion.div
                variants={NODE_VARIANTS}
                {...hoverLift}
                className={`rounded-xl border p-6 ${
                  node.main ? "border-violet/40 bg-canvas-raised" : "border-line bg-surface"
                }`}
              >
                <p className={`mb-2 text-[15px] font-bold ${node.main ? "text-violet" : ""}`}>
                  {node.label}
                </p>
                <p className="text-[14.5px] leading-normal text-ink-muted">{node.desc}</p>
              </motion.div>
            </React.Fragment>
          ))}
        </Stagger>
        <FadeUp delay={0.25}>
          <p className="mt-6 text-center text-[15px] text-ink-muted">
            Your projects run on your computer. Vibyra tells you when a workflow needs cloud AI or
            publishing.
          </p>
        </FadeUp>
      </Container>
    </Section>
  );
}
