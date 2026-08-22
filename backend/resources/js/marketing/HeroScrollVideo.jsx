import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll } from "motion/react";
import HeroScrollStory from "./HeroScrollStory.jsx";

/* =========================================================
   Part 1 — Scroll-scrubbed video hero.
   The section is 1000vh tall; the viewport stays pinned while
   scroll position drives video.currentTime (forward and back)
   through a small lerp for buttery scrubbing. The clip is four
   concatenated shots encoded as one continuous 18s video, and
   the scrub ends on the final frame with no fade-out.
   ========================================================= */

function ScrollVideoHero() {
  const reduced = useReducedMotion();
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const targetRef = useRef(0);
  const playheadRef = useRef(0);
  const [videoReady, setVideoReady] = useState(false);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  /* Keep a direct stream visible immediately, then swap in a fully buffered
     copy for reliable forward and backward scrubbing. */
  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    fetch("/media/hero-scroll.mp4")
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        if (videoRef.current) videoRef.current.src = objectUrl;
      })
      .catch(() => {
        if (!cancelled && videoRef.current) videoRef.current.src = "/media/hero-scroll.mp4";
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  /* Scroll position → target progress */
  useEffect(() => {
    if (reduced) return undefined;
    targetRef.current = scrollYProgress.get();
    return scrollYProgress.on("change", (v) => {
      targetRef.current = v;
    });
  }, [scrollYProgress, reduced]);

  /* rAF loop eases the playhead toward the scroll target for buttery scrubbing.
     Exponential smoothing on the frame delta keeps the feel identical at any
     refresh rate. Duration is read live off the element so there is no
     load-order race. The clip is encoded all-intra, so every seek is exact. */
  useEffect(() => {
    if (reduced) return undefined;
    let raf;
    let last;
    const tick = (now) => {
      const dt = last === undefined ? 1 / 60 : Math.min((now - last) / 1000, 0.1);
      last = now;
      const video = videoRef.current;
      const duration = video?.duration;
      if (video && Number.isFinite(duration) && duration > 0 && !video.seeking) {
        const target = targetRef.current * (duration - 0.06);
        const cur = playheadRef.current;
        const gap = target - cur;
        /* settle fully when close enough to a frame; otherwise ease in */
        const next = Math.abs(gap) < 0.008 ? target : cur + gap * (1 - Math.exp(-9 * dt));
        if (Math.abs(next - cur) > 0.0005) {
          playheadRef.current = next;
          video.currentTime = Math.max(next, 0.001);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <section ref={sectionRef} className={reduced ? "relative" : "relative h-[1000vh]"}>
      <div
        className={`${reduced ? "relative" : "sticky top-0"} h-screen overflow-hidden bg-canvas`}
        style={{
          backgroundImage:
            "linear-gradient(rgba(7,9,15,.52), rgba(7,9,15,.76)), url('/media/homepage/vibyra-cobalt-stage.png')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <video
          src="/media/hero-scroll.mp4"
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => {
            e.currentTarget.currentTime = 0.001;
          }}
          className="absolute inset-0 size-full object-contain"
          aria-hidden="true"
        />
        <motion.video
          ref={videoRef}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={(e) => {
            const duration = e.currentTarget.duration;
            const target = Number.isFinite(duration) ? targetRef.current * (duration - 0.06) : 0.001;
            e.currentTarget.currentTime = Math.max(target, 0.001);
          }}
          onLoadedData={() => setVideoReady(true)}
          className={`absolute inset-0 size-full object-contain transition-opacity duration-300 ${videoReady ? "opacity-100" : "opacity-0"}`}
          aria-hidden="true"
        />

        <div className="absolute inset-0 bg-canvas/5" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/35 via-transparent to-canvas/70" aria-hidden="true" />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 90% 75% at 50% 48%, transparent 58%, rgba(13,13,15,0.32) 100%)" }}
          aria-hidden="true"
        />

        <HeroScrollStory progress={scrollYProgress} reduced={reduced} />
      </div>
    </section>
  );
}

export default ScrollVideoHero;
