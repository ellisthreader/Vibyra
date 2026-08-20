import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import logoUrl from "../../assets/vibyra-cobalt.png";
import {
  FIRST_WELCOME_BEAT_MS,
  FIRST_WELCOME_DURATION_MS,
  firstWelcomeBeats,
  rememberFirstWelcome,
} from "../../lib/firstWelcomePolicy";
import { useModalFocus } from "../../lib/useModalFocus";
import type { AccountProfile } from "../../types";

interface FirstWelcomeProps {
  profile: AccountProfile;
  onFinish: (handoff: boolean) => void;
  onHandoffStart: () => void;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const media = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function AnimatedTitle({ text, reduced }: { text: string; reduced: boolean }) {
  if (reduced) return <h1 id="first-welcome-title">{text}</h1>;
  return (
    <h1 id="first-welcome-title" aria-label={text}>
      {text.split(/\s+/).map((word, index) => (
        <span className="first-welcome__word-mask" aria-hidden="true" key={`${word}-${index}`}>
          <span
            className="first-welcome__word"
            style={{ "--welcome-word": index } as CSSProperties}
          >
            {word}
          </span>{" "}
        </span>
      ))}
    </h1>
  );
}

export function FirstWelcome({ profile, onFinish, onHandoffStart }: FirstWelcomeProps) {
  const reduced = usePrefersReducedMotion();
  const beats = firstWelcomeBeats(profile.name);
  const [beatIndex, setBeatIndex] = useState(0);
  const [complete, setComplete] = useState(reduced);
  const [exitMode, setExitMode] = useState<"handoff" | "skip" | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const playbackGeneration = useRef(0);
  const closing = useRef(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (dialogRef.current) rememberFirstWelcome(profile);
  }, [profile]);

  useEffect(() => {
    const generation = ++playbackGeneration.current;
    setBeatIndex(0);
    setComplete(reduced);
    if (reduced) return;
    const timers = [1, 2, 3].map((index) => window.setTimeout(() => {
      if (playbackGeneration.current === generation) setBeatIndex(index);
    }, index * FIRST_WELCOME_BEAT_MS));
    timers.push(window.setTimeout(() => {
      if (playbackGeneration.current === generation) setComplete(true);
    }, FIRST_WELCOME_DURATION_MS));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [reduced]);

  useEffect(() => () => {
    playbackGeneration.current += 1;
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  const requestClose = useCallback((handoff: boolean) => {
    if (closing.current) return;
    closing.current = true;
    playbackGeneration.current += 1;
    setExitMode(handoff ? "handoff" : "skip");
    if (handoff) onHandoffStart();
    closeTimer.current = window.setTimeout(
      () => onFinish(handoff),
      reduced ? 0 : handoff ? 440 : 180,
    );
  }, [onFinish, onHandoffStart, reduced]);
  const closeFromEscape = useCallback(() => requestClose(false), [requestClose]);
  useModalFocus(dialogRef, true, closeFromEscape);

  const beat = beats[beatIndex];
  const className = [
    "first-welcome",
    reduced ? "first-welcome--reduced" : "",
    complete ? "first-welcome--complete" : "",
    exitMode ? `first-welcome--leaving first-welcome--${exitMode}` : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={className}
      data-beat={beatIndex}
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-welcome-title"
      ref={dialogRef}
    >
      <div className="first-welcome__atmosphere" aria-hidden="true"><span /></div>
      <button className="first-welcome__skip" onClick={() => requestClose(false)}>
        Skip intro <span aria-hidden="true">Esc</span>
      </button>
      <div
        className="first-welcome__dialog"
      >
        <main className="first-welcome__stage">
          <div className="first-welcome__mark" aria-hidden="true">
            <img src={logoUrl} alt="" draggable={false} />
          </div>
          {reduced ? (
            <div className="first-welcome__static">
              <AnimatedTitle text={beats[0].title} reduced />
              <p>{beats[0].body}</p>
              <ul>{beats.slice(1).map((item) => <li key={item.title}>{item.title}</li>)}</ul>
            </div>
          ) : (
            <div className="first-welcome__beat" key={beat.title}>
              <p className="first-welcome__eyebrow">{beat.eyebrow}</p>
              <AnimatedTitle text={beat.title} reduced={false} />
              <p className="first-welcome__body">{beat.body}</p>
            </div>
          )}
          <div className="first-welcome__action" aria-hidden={!complete}>
            {complete && (
              <>
                <button className="first-welcome__primary" onClick={() => requestClose(true)}>
                  Start building <span aria-hidden="true">→</span>
                </button>
                <small>Runs on this computer.</small>
              </>
            )}
          </div>
        </main>
        <div
          className="first-welcome__progress"
          role="progressbar"
          aria-label="Welcome introduction"
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuenow={complete ? 4 : beatIndex + 1}
        ><span /></div>
        <p className="sr-only" role="status" aria-live="polite">{beat.title} {beat.body}</p>
      </div>
    </div>
  );
}
