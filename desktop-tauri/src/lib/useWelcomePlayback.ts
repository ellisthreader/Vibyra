import { useCallback, useEffect, useRef, useState } from "react";

/** The installed introduction's clock pauses while the document is hidden. */
export function useWelcomePlayback(durations: readonly number[]) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [paused, setPaused] = useState(reduced);
  const [hidden, setHidden] = useState(document.hidden);
  const elapsed = useRef(0);
  const final = step === durations.length - 1;
  const complete = final && progress >= 1;
  const playing = !paused && !hidden && !complete;
  const go = useCallback((index: number) => {
    elapsed.current = 0;
    setProgress(0);
    setStep(Math.max(0, Math.min(durations.length - 1, index)));
  }, [durations.length]);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => { setReduced(media.matches); if (media.matches) setPaused(true); };
    const visibility = () => setHidden(document.hidden);
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      elapsed.current += now - last;
      last = now;
      const duration = durations[step];
      if (elapsed.current >= duration) {
        if (final) setProgress(1);
        else go(step + 1);
      } else setProgress(elapsed.current / duration);
    }, 25);
    return () => window.clearInterval(timer);
  }, [playing, step, durations, go, final]);
  return { step, progress, paused, reduced, playing, final, complete, go,
    toggle: () => setPaused(value => !value),
    replay: () => { go(0); setPaused(reduced); } };
}
