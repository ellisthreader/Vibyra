import { useEffect, useRef, useState } from "react";
import { useReduceMotion } from "./useReduceMotion";

type Options = {
  charDelay?: number;
  startDelay?: number;
  blinkAfter?: number;
  blinkMs?: number;
};

export function useTypewriter(text: string, options: Options = {}) {
  const { charDelay = 65, startDelay = 0, blinkAfter = 5, blinkMs = 530 } = options;
  const reduced = useReduceMotion();
  const [visible, setVisible] = useState("");
  const [caret, setCaret] = useState(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const blinkTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (blinkTimer.current) {
      clearInterval(blinkTimer.current);
      blinkTimer.current = null;
    }
    if (reduced) {
      setVisible(text);
      setCaret(false);
      return;
    }
    setVisible("");
    setCaret(true);
    for (let i = 1; i <= text.length; i += 1) {
      const t = setTimeout(() => setVisible(text.slice(0, i)), startDelay + i * charDelay);
      timers.current.push(t);
    }
    const finishedAt = startDelay + text.length * charDelay;
    const blinkStart = setTimeout(() => {
      blinkTimer.current = setInterval(() => setCaret((prev) => !prev), blinkMs);
    }, finishedAt + 80);
    timers.current.push(blinkStart);
    const fadeCaret = setTimeout(() => {
      if (blinkTimer.current) {
        clearInterval(blinkTimer.current);
        blinkTimer.current = null;
      }
      setCaret(false);
    }, finishedAt + blinkAfter * blinkMs);
    timers.current.push(fadeCaret);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      if (blinkTimer.current) {
        clearInterval(blinkTimer.current);
        blinkTimer.current = null;
      }
    };
  }, [blinkAfter, blinkMs, charDelay, reduced, startDelay, text]);

  return { value: visible, caretVisible: caret, done: visible === text };
}
