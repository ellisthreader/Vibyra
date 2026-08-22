import React, { useRef } from "react";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Chip } from "./ui.jsx";
import Beam from "./HeroBeam.jsx";
import TerminalWindow from "./HeroTerminalWindow.jsx";

/* =========================================================
   Part 2 — Terminal showcase. Choreography starts when the
   stage scrolls into view (not on page load).
   Timeline: phone sends 0.9/1.3 · beam 1.15–2.0 · pulse 2.0 ·
   terminal 2.1–3.7 · approval 3.9 · rail 1.0/2.2/3.6/4.1
   ========================================================= */

const RAIL = [
  ["Send", 1.0],
  ["Run", 2.2],
  ["Review", 3.6],
  ["Preview", 4.1],
];

function StageShowcase() {
  const reduced = useReducedMotion();
  const stageRef = useRef(null);
  const inView = useInView(stageRef, { once: true, amount: 0.3 });
  const active = inView && !reduced;

  const d = (s) => (active ? { animationDelay: `${s}s` } : undefined);
  /* Hidden until the stage enters view, then the CSS timeline runs */
  const cls = (base) => (active ? base : reduced ? "" : "opacity-0");

  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ["start end", "end start"],
  });
  const stageY = useTransform(scrollYProgress, [0, 1], [50, -50]);

  return (
    <section id="terminal-showcase" ref={stageRef} className="relative overflow-hidden pt-20 md:pt-28">
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse at center, rgba(123,44,255,0.10) 0%, transparent 62%)" }}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-[1240px] px-5 sm:px-8 xl:px-16">
        {/* Workflow rail */}
        <ol
          className={`flex items-center justify-center gap-3 sm:gap-5 ${cls("anim-rise")}`}
          aria-label="Workflow: send, run, review, preview"
        >
          {RAIL.map(([label, at], i) => (
            <React.Fragment key={label}>
              {i > 0 && <span className="h-px w-6 bg-line-strong sm:w-10" aria-hidden="true" />}
              <li
                className={`flex items-center gap-2 text-[13px] font-semibold tracking-wide ${active ? "rail-step" : "text-ink"}`}
                style={d(at)}
              >
                <span className={`size-1.5 rounded-full ${active ? "rail-dot" : "bg-violet"}`} style={d(at)} aria-hidden="true" />
                {label}
              </li>
            </React.Fragment>
          ))}
        </ol>

        {/* Product stage with gentle parallax */}
        <motion.div style={reduced ? undefined : { y: stageY }}>
          <div className={`relative mx-auto mt-10 mb-8 max-w-[980px] md:mb-24 ${cls("anim-rise")}`} style={d(0.2)}>
            <TerminalWindow active={active} d={d} />
            <Beam active={active} />

            {/* Phone — overlaps lower right, gentle float after entrance */}
            <div className="relative z-[4] mx-auto -mt-14 w-[min(250px,72%)] md:absolute md:-bottom-16 md:-right-10 md:mt-0 md:w-[250px] lg:-right-24">
              <div className={active ? "anim-float" : ""}>
                <div className="rounded-[28px] bg-gradient-to-b from-white/14 via-white/6 to-white/10 p-px">
                  <div className="overflow-hidden rounded-[27px] bg-canvas-raised shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
                    <div className="mx-auto mt-3 h-1.5 w-16 rounded-full bg-white/10" aria-hidden="true" />
                    <div className="px-3.5 pb-5 pt-3">
                      <p className="mb-3 text-center text-xs font-semibold text-ink-muted">checkout-app</p>
                      <div className={`ml-5 rounded-2xl rounded-br-md bg-violet px-3.5 py-2.5 text-[12.5px] leading-snug text-white ${cls("anim-pop")}`} style={d(0.9)}>
                        Fix the broken checkout layout on mobile
                      </div>
                      <div className={`mt-2.5 flex items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-ink-muted ${cls("anim-pop")}`} style={d(1.3)}>
                        <span className="pulse-dot size-[7px] shrink-0 rounded-full bg-amber" aria-hidden="true" />
                        Desktop is working…
                      </div>
                      <div className={`mt-2.5 rounded-2xl border border-violet/30 bg-surface p-3.5 text-[12.5px] ${cls("anim-pop")}`} style={d(3.9)}>
                        <p className="mb-2.5 font-semibold text-ink">2 files changed</p>
                        <div className="flex gap-2">
                          <Chip accent>Review</Chip>
                          <Chip>Preview</Chip>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default StageShowcase;
