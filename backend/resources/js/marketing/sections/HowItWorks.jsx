import React from "react";
import { motion } from "motion/react";
import { Chip, Container, Eyebrow, MiniCard, Section, SectionTitle } from "../ui.jsx";
import { FadeUp, Parallax, Stagger, hoverLift, slideItem } from "../motion.jsx";

const CHAPTERS = [
  {
    num: "01",
    title: "Connect",
    body: (
      <>
        Sign in on both devices with the same Vibyra account. Pairing needs explicit approval on
        the phone <strong className="font-semibold text-ink">and</strong> the desktop — nothing
        links silently.
      </>
    ),
    visual: (
      <MiniCard>
        <p className="mb-2.5 text-[15.5px] font-bold">Pair with this desktop?</p>
        <p className="mb-1.5 font-mono text-[13px] text-ink-muted">
          ELLIS-PC · same account · local network
        </p>
        <div className="mt-4 flex gap-2.5">
          <Chip accent>Approve</Chip>
          <Chip>Deny</Chip>
        </div>
      </MiniCard>
    ),
  },
  {
    num: "02",
    title: "Direct",
    body: "Open a real project from your computer and send a concrete task from your phone. The desktop terminal picks it up and starts working with the model or connected account you chose.",
    visual: (
      <MiniCard className="font-mono">
        <p className="mb-2.5 text-sm text-violet">▸ checkout-app</p>
        <p className="text-[13px] leading-loose">Running plan · Claude</p>
        <p className="text-[13px] leading-loose text-ink-muted">Editing Checkout.tsx…</p>
        <p className="text-[13px] leading-loose text-ink-muted">Updating styles…</p>
      </MiniCard>
    ),
  },
  {
    num: "03",
    title: "Review",
    body: "See exactly which files changed before anything is applied. Approve, deny, or undo — sensitive actions always ask first.",
    visual: (
      <MiniCard>
        <p className="mb-2.5 text-[15.5px] font-bold">Proposed changes</p>
        <p className="mb-1.5 font-mono text-[13px] text-ink-muted">
          Checkout.tsx <span className="text-ok">+24</span> <span className="text-pink">−9</span>
        </p>
        <p className="mb-1.5 font-mono text-[13px] text-ink-muted">
          checkout.css <span className="text-ok">+12</span> <span className="text-pink">−3</span>
        </p>
        <div className="mt-4 flex gap-2.5">
          <Chip accent>Apply</Chip>
          <Chip>Undo</Chip>
        </div>
      </MiniCard>
    ),
  },
  {
    num: "04",
    title: "Preview",
    body: "Open a live preview of the result on desktop or phone, then continue with a follow-up — the workflow never leaves the project.",
    visual: (
      <MiniCard>
        <p className="mb-2.5 flex items-center gap-2 text-[15.5px] font-bold">
          <span className="size-2 rounded-full bg-ok" aria-hidden="true" /> Preview running
        </p>
        <p className="font-mono text-[13px] text-ink-muted">localhost:3000 · checkout fixed</p>
        <div className="mt-4 grid grid-cols-2 gap-2" aria-hidden="true">
          <span className="h-[34px] rounded-lg border border-line bg-surface-elevated" />
          <span className="h-[34px] rounded-lg border border-line bg-surface-elevated" />
          <span className="col-span-2 h-11 rounded-lg border border-violet/35 bg-violet-soft" />
        </div>
      </MiniCard>
    ),
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <Container narrow>
        <FadeUp>
          <Eyebrow>How it works</Eyebrow>
          <SectionTitle>One workflow, two surfaces.</SectionTitle>
        </FadeUp>
      </Container>
      <Container className="mt-8 flex flex-col gap-14 md:mt-16 md:gap-24">
        {CHAPTERS.map((chapter, i) => {
          const flipped = i % 2 === 1;
          return (
            <Stagger
              key={chapter.num}
              className="grid items-center gap-8 md:grid-cols-2 md:gap-20"
              stagger={0.15}
            >
              <motion.div
                variants={slideItem(flipped ? 1 : -1)}
                className={`min-w-0 ${flipped ? "md:order-2" : ""}`}
              >
                <p className="mb-3 font-mono text-[13px] text-violet">{chapter.num}</p>
                <h3 className="mb-3.5 text-2xl font-bold tracking-tight xl:text-[2.1rem]">
                  {chapter.title}
                </h3>
                <p className="max-w-[44ch] text-ink-muted">{chapter.body}</p>
              </motion.div>
              <motion.div
                variants={slideItem(flipped ? -1 : 1)}
                className={`flex min-w-0 justify-start md:justify-center ${flipped ? "md:order-1" : ""}`}
              >
                <Parallax offset={26} className="w-full max-w-[360px]">
                  <motion.div {...hoverLift}>{chapter.visual}</motion.div>
                </Parallax>
              </motion.div>
            </Stagger>
          );
        })}
      </Container>
    </Section>
  );
}
