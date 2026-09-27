import { useCallback, useEffect, useRef, useState } from "react";

/** One display-synchronized clock. Carry frame remainder across chapter boundaries. */
export function useWelcomePlayback(durations: readonly number[]) {
  const [frame, setFrame] = useState({ step: 0, progress: 0 });
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [paused, setPaused] = useState(reduced);
  const [hidden, setHidden] = useState(document.hidden);
  const cursor = useRef({ step: 0, elapsed: 0 });
  const last = useRef(0);
  const final = frame.step === durations.length - 1;
  const complete = final && frame.progress >= 1;
  const playing = !paused && !hidden && !complete;
  const running = useRef(false);

  const advance = useCallback((now: number) => {
    const current = cursor.current;
    current.elapsed += Math.max(0, now - last.current);
    last.current = now;
    while (current.elapsed >= durations[current.step] && current.step < durations.length - 1) {
      current.elapsed -= durations[current.step];
      current.step += 1;
    }
    const progress = Math.min(1, current.elapsed / durations[current.step]);
    setFrame({ step: current.step, progress });
    return progress < 1;
  }, [durations]);

  const go = useCallback((index: number) => {
    const step = Math.max(0, Math.min(durations.length - 1, index));
    cursor.current = { step, elapsed: 0 };
    last.current = performance.now();
    setFrame({ step, progress: 0 });
  }, [durations.length]);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => {
      setReduced(media.matches);
      if (media.matches) { if (running.current) advance(performance.now()); setPaused(true); }
    };
    const visibility = () => {
      if (document.hidden && running.current) advance(performance.now());
      setHidden(document.hidden);
    };
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [advance]);

  useEffect(() => {
    if (!playing) return;
    running.current = true;
    last.current = performance.now();
    let animation = 0;
    const tick = (now: number) => {
      if (advance(now)) animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => { running.current = false; cancelAnimationFrame(animation); };
  }, [playing, advance]);

  const toggle = useCallback(() => {
    if (running.current) advance(performance.now());
    setPaused(value => !value);
  }, [advance]);
  return { ...frame, paused, reduced, playing, final, complete, go, toggle };
}
