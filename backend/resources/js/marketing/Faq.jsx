import React, { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Container, Eyebrow, Section, SectionTitle } from "./ui.jsx";
import { EASE, FadeUp } from "./motion.jsx";

const FAQS = [
  [
    "Does my computer need to stay on?",
    "Yes. Your projects and terminals live on your computer. The phone directs and reviews the work.",
  ],
  [
    "What stays local?",
    "Project files and commands stay on your computer. Sign-in, billing, sync, supported AI routing, memory, and publishing use Vibyra's cloud.",
  ],
  [
    "What actions require approval?",
    "Connecting devices, applying file edits, and starting preview servers all ask first. Full access is an explicit workspace choice.",
  ],
  [
    "What if the desktop disconnects?",
    "The phone shows the connection state. Work resumes when the desktop is reachable again, and nothing is applied without approval.",
  ],
];

function FaqItem({ question, answer, open, onToggle, id }) {
  return (
    <div className="border-b border-line">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`faq-panel-${id}`}
        className="relative w-full py-5 pr-10 text-left text-[16.5px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet"
      >
        {question}
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[22px] font-normal text-ink-muted"
          aria-hidden="true"
        >
          +
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`faq-panel-${id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <p className="max-w-[62ch] pb-5 text-[15.5px] text-ink-muted">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Faq() {
  const [openIndex, setOpenIndex] = useState(0);
  return (
    <Section id="faq">
      <Container narrow>
        <FadeUp>
          <Eyebrow>FAQ</Eyebrow>
          <SectionTitle>Good to know.</SectionTitle>
        </FadeUp>
        <div className="mt-2 border-t border-line">
          {FAQS.map(([question, answer], index) => (
            <FaqItem
              key={question}
              id={index}
              question={question}
              answer={answer}
              open={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
            />
          ))}
        </div>
      </Container>
    </Section>
  );
}
