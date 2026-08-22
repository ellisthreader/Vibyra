import React, { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";

export const EASE = [0.22, 1, 0.36, 1];

/* Fade + rise once when scrolled into view */
export function FadeUp({ children, className = "", delay = 0, y = 30, ...rest }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* Container that staggers its motion children */
export function Stagger({ children, as = "div", className = "", stagger = 0.1, ...rest }) {
  const reduced = useReducedMotion();
  const M = motion[as] ?? motion.div;
  return (
    <M
      className={className}
      initial={reduced ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
      {...rest}
    >
      {children}
    </M>
  );
}

export const riseItem = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

export const slideItem = (dir = 1, x = 48) => ({
  hidden: { opacity: 0, x: dir * x },
  show: { opacity: 1, x: 0, transition: { duration: 0.8, ease: EASE } },
});

/* Subtle scroll parallax — element drifts against scroll direction */
export function Parallax({ children, className = "", offset = 40, ...rest }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [offset, -offset]);
  return (
    <motion.div ref={ref} className={className} style={reduced ? undefined : { y }} {...rest}>
      {children}
    </motion.div>
  );
}

/* Interactive card lift */
export const hoverLift = {
  whileHover: { y: -6, transition: { type: "spring", stiffness: 320, damping: 22 } },
};
