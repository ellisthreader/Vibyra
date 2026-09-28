import React from "react";
import { motion } from "motion/react";
import { Container, Eyebrow, Section } from "../ui.jsx";
import { FadeUp, Parallax, Stagger } from "../motion.jsx";

const FEATURE_ITEM_VARIANTS = {
  hidden: { opacity: 0, x: -24 },
  show: { opacity: 1, x: 0, transition: { duration: 0.5 } },
};

const DESKTOP_FEATURES = [
  "Up to 12 terminal sessions in focus or grid layouts",
  "Independent agents or coordinated agent teams",
  "Editor, live preview, AI chat, and project memory in one panel",
  "Safe workspaces by default—full access is an explicit opt-in",
  "Screenshot capture with crop, annotate, and drag-to-chat",
];

const PHONE_FEATURES = [
  "Secure same-account pairing with two-sided approval",
  "Project chats with real detected project context",
  "Approve, deny, or undo AI-generated changes",
  "Live previews of what your desktop just built",
  "Optional Face ID / Touch ID app lock",
];

function FeatureList({ items }) {
  return (
    <Stagger as="ul" stagger={0.08}>
      {items.map((item, index) => (
        <motion.li
          key={item}
          variants={FEATURE_ITEM_VARIANTS}
          className={`relative list-none py-2.5 pl-[30px] text-base text-ink-muted ${
            index < items.length - 1 ? "border-b border-line" : ""
          }`}
        >
          <span className="absolute left-1 top-[19px] size-2 rounded-full bg-violet" aria-hidden="true" />
          {item}
        </motion.li>
      ))}
    </Stagger>
  );
}

export function DesktopDepth() {
  return (
    <Section id="desktop">
      <Container className="grid items-center gap-10 md:grid-cols-2 xl:gap-[88px]">
        <div className="min-w-0">
          <FadeUp>
            <Eyebrow>Vibyra Desktop</Eyebrow>
            <h2 className="mb-6 text-[1.8rem] font-bold leading-[1.15] tracking-tight xl:text-[2.6rem]">
              A full terminal-first workspace, not a bridge installer.
            </h2>
          </FadeUp>
          <FeatureList items={DESKTOP_FEATURES} />
        </div>
        <FadeUp className="min-w-0" y={40}>
          <Parallax offset={34}>
            <figure className="desktop-campaign-stage">
              <img className="desktop-campaign-stage__backdrop" src="/media/homepage/vibyra-cobalt-stage.png" alt="" loading="lazy" />
              <div className="desktop-campaign-stage__window">
                <span className="desktop-campaign-stage__label">12 live workspaces</span>
                <img
                  src="/media/homepage/desktop-multi-terminal.png"
                  alt="Vibyra Desktop showing multiple named AI terminal agents working in a grid."
                  loading="lazy"
                  width="1196"
                  height="788"
                />
              </div>
              <figcaption>Real Vibyra Desktop multi-terminal workspace.</figcaption>
            </figure>
          </Parallax>
        </FadeUp>
      </Container>
    </Section>
  );
}

export function PhoneDepth() {
  return (
    <Section id="phone">
      <Container className="grid items-center gap-10 md:grid-cols-2 xl:gap-[88px]">
        <FadeUp className="min-w-0 md:order-1" y={40}>
          <Parallax offset={34}>
            <figure className="editorial-phone-stage">
              <img className="editorial-phone-stage__backdrop" src="/media/homepage/vibyra-cobalt-stage.png" alt="" loading="lazy" />
              <span className="editorial-phone-stage__desktop">
                <span className="editorial-phone-stage__chrome" aria-hidden="true"><i /><i /><i /></span>
                <img
                  src="/media/homepage/desktop-welcome-review.png"
                  alt="Vibyra Desktop showing the Build here, Review anywhere workflow."
                  loading="lazy"
                  width="1360"
                  height="816"
                />
              </span>
              <span className="editorial-phone-stage__screen">
                <img
                  src="/media/homepage/mobile-vibyra-auth.png"
                  alt="Vibyra phone app welcome and secure sign-in screen."
                  loading="lazy"
                  width="390"
                  height="844"
                />
              </span>
              <figcaption>Authentic Vibyra Desktop and mobile product screens.</figcaption>
            </figure>
          </Parallax>
        </FadeUp>
        <div className="min-w-0 md:order-2">
          <FadeUp>
            <Eyebrow>Vibyra for phone</Eyebrow>
            <h2 className="mb-6 text-[1.8rem] font-bold leading-[1.15] tracking-tight xl:text-[2.6rem]">
              Review and approve away from the desk.
            </h2>
          </FadeUp>
          <FeatureList items={PHONE_FEATURES} />
        </div>
      </Container>
    </Section>
  );
}
