import React from "react";
import { Container, Eyebrow, Section, SectionTitle } from "../ui.jsx";
import { FadeUp } from "../motion.jsx";

const STEPS = [
  {
    number: "01",
    title: "Run it on your computer",
    body: "Open a real project and start supported AI work in Vibyra Desktop.",
  },
  {
    number: "02",
    title: "Follow it from your phone",
    body: "Send the next task, see progress, and open the live result away from your desk.",
  },
  {
    number: "03",
    title: "Approve what changes",
    body: "Review proposed edits before they are applied. Sensitive actions always ask first.",
  },
];

export default function SimpleOverview() {
  return (
    <Section id="how-it-works">
      <Container narrow>
        <FadeUp>
          <Eyebrow>How it works</Eyebrow>
          <SectionTitle>One project. Two screens.</SectionTitle>
          <p className="max-w-[58ch] text-lg text-ink-muted">
            Your computer does the work. Your phone keeps the project moving.
          </p>
        </FadeUp>
      </Container>

      <Container className="mt-10 md:mt-14">
        <div className="grid border-y border-line md:grid-cols-3">
          {STEPS.map((step) => (
            <article
              key={step.number}
              className="border-b border-line py-7 last:border-b-0 md:border-b-0 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
            >
              <p className="mb-5 font-mono text-xs text-violet">{step.number}</p>
              <h3 className="mb-2 text-xl font-semibold tracking-tight">{step.title}</h3>
              <p className="max-w-[34ch] text-[15px] text-ink-muted">{step.body}</p>
            </article>
          ))}
        </div>

        <FadeUp className="mt-12 md:mt-16" y={20}>
          <figure className="overflow-hidden rounded-xl border border-line bg-surface">
            <img
              src="/media/homepage/desktop-multi-terminal.png"
              alt="Vibyra Desktop showing live AI terminal sessions for one project."
              loading="lazy"
              width="1920"
              height="1080"
              className="block aspect-video w-full object-cover"
            />
          </figure>
          <div className="grid gap-3 border-b border-line py-5 text-sm text-ink-muted sm:grid-cols-3">
            <p><span className="mr-2 text-ok">●</span>Projects run locally</p>
            <p><span className="mr-2 text-ok">●</span>Edits need approval</p>
            <p><span className="mr-2 text-ok">●</span>Cloud use stays visible</p>
          </div>
        </FadeUp>
      </Container>
    </Section>
  );
}
