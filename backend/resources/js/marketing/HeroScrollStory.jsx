import React, { useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent } from "motion/react";
import { Button } from "./ui.jsx";

const CHAPTERS = [
  {
    at: 0,
    label: "Start",
    eyebrow: "AI work, connected",
    title: <>Build here.<br /><span className="gradient-word">Keep moving.</span></>,
    body: "Run on your computer. Review from your phone.",
    layout: "hero-story-copy--intro",
    actions: true,
  },
  {
    at: 0.26,
    label: "Send",
    eyebrow: "Send",
    title: <>Send from<br />your phone.</>,
    body: "Vibyra opens the right project on your computer.",
    layout: "hero-story-copy--connect",
  },
  {
    at: 0.54,
    label: "Run",
    eyebrow: "Run",
    title: <>Your computer<br />runs it.</>,
    body: "Follow the work in one place.",
    layout: "hero-story-copy--run",
  },
  {
    at: 0.78,
    label: "Review",
    eyebrow: "Review",
    title: <>Review from<br /><span className="gradient-word">anywhere.</span></>,
    body: "Check changes and preview the result.",
    layout: "hero-story-copy--finish",
  },
];

function chapterAt(progress) {
  for (let index = CHAPTERS.length - 1; index >= 0; index -= 1) {
    if (progress >= CHAPTERS[index].at) return index;
  }
  return 0;
}

function StoryCopy({ chapter, reduced }) {
  return (
    <motion.div
      key={chapter.label}
      className={`hero-story-copy ${chapter.layout}`}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduced ? undefined : { opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="hero-story-eyebrow">{chapter.eyebrow}</p>
      <h1 className="hero-story-title">{chapter.title}</h1>
      <p className="hero-story-body">{chapter.body}</p>
      {chapter.actions && (
        <div className="mt-7 flex flex-wrap gap-3">
          <Button href="/downloads">Get Vibyra</Button>
          <Button href="#how-it-works" variant="secondary">How it works <span aria-hidden="true">↓</span></Button>
        </div>
      )}
    </motion.div>
  );
}

function StoryProgress({ active }) {
  return (
    <div
      className="hero-story-progress"
      style={{ "--hero-story-steps": CHAPTERS.length }}
      aria-hidden="true"
    >
      {CHAPTERS.map((chapter, index) => (
        <div key={chapter.label} className={index === active ? "is-active" : index < active ? "is-complete" : ""}>
          <span className="hero-story-progress-line" />
          <small>{chapter.label}</small>
        </div>
      ))}
    </div>
  );
}

export default function HeroScrollStory({ progress, reduced }) {
  const [active, setActive] = useState(() => chapterAt(progress.get()));

  useMotionValueEvent(progress, "change", (value) => {
    const next = chapterAt(value);
    setActive((current) => (current === next ? current : next));
  });

  const shown = reduced ? CHAPTERS[0] : CHAPTERS[active];

  return (
    <div className="absolute inset-0 z-10 mx-auto w-full max-w-[1440px]">
      <AnimatePresence mode="sync" initial={false}>
        <StoryCopy chapter={shown} reduced={reduced} />
      </AnimatePresence>
      {!reduced && <StoryProgress active={active} />}
    </div>
  );
}
