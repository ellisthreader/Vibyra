import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import logoUrl from "../../assets/vibyra-cobalt.png";
import { firstWelcomeBeats, rememberFirstWelcome, WELCOME_DURATIONS } from "../../lib/firstWelcomePolicy";
import { useWelcomePlayback } from "../../lib/useWelcomePlayback";
import { useModalFocus } from "../../lib/useModalFocus";
import { WelcomeArtwork } from "./WelcomeArtwork";
import { preloadWelcomeImages } from "./WelcomeScreens";
import { WelcomeScene } from "./WelcomeScene";
import type { AccountProfile } from "../../types";

interface FirstWelcomeProps {
  profile: AccountProfile;
  onFinish: (handoff: boolean) => void;
  onHandoffStart: () => void;
}

export function FirstWelcome({ profile, onFinish, onHandoffStart }: FirstWelcomeProps) {
  const player = useWelcomePlayback(WELCOME_DURATIONS);
  const [leaving, setLeaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const beats = firstWelcomeBeats(profile.name);
  const beat = beats[player.step];
  useEffect(() => {
    if (dialogRef.current) rememberFirstWelcome(profile);
    preloadWelcomeImages();
  }, [profile]);
  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);
  const requestClose = useCallback((handoff: boolean) => {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    if (handoff) onHandoffStart();
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    closeTimer.current = window.setTimeout(() => onFinish(handoff), reduced ? 0 : 850);
  }, [onFinish, onHandoffStart]);
  useEffect(() => { if (player.complete) requestClose(true); }, [player.complete, requestClose]);
  const closeFromEscape = useCallback(() => requestClose(false), [requestClose]);
  useModalFocus(dialogRef, true, closeFromEscape);
  return (
    <div className={`first-welcome${leaving ? " first-welcome--leaving" : ""}`}
      role="dialog" aria-modal="true" aria-labelledby="first-welcome-title" ref={dialogRef}
      data-step={player.step} data-playing={player.playing} style={{ "--tour-step": player.step } as CSSProperties}>
      <div className="first-welcome__atmosphere" aria-hidden="true"><i /><b /></div>
      <header className="first-welcome__header">
        <div className="first-welcome__brand"><img src={logoUrl} alt="" />Vibyra</div>
        <button type="button" className="first-welcome__skip" onClick={closeFromEscape}>Skip intro</button>
      </header>
      <main className="first-welcome__stage">
        {beats.map((item, index) => <WelcomeScene key={item.label} beat={item} index={index}
          activeStep={player.step} time={player.reduced ? 3 : player.progress * WELCOME_DURATIONS[player.step] / 1000}
          manual={player.paused} onFinish={() => requestClose(true)} />)}
        <WelcomeArtwork step={player.step} time={player.progress * WELCOME_DURATIONS[player.step] / 1000} reduced={player.reduced} playing={player.playing && !leaving} />
        <p className="first-welcome__note">{beat.note ?? ""}</p>
      </main>
      <footer className="first-welcome__footer">
        <button type="button" className="first-welcome__play" aria-label={player.paused ? "Play introduction" : "Pause introduction"} onClick={player.toggle}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            {player.playing ? <><rect x="5" y="4" width="3" height="12" rx=".6" /><rect x="12" y="4" width="3" height="12" rx=".6" /></> : <path d="M6 3.8v12.4L16 10z" />}
          </svg>
        </button>
        <nav className="first-welcome__chapters" aria-label="Introduction chapters">
          {beats.map((item, index) => <button type="button" key={item.label} aria-current={player.step === index ? "step" : undefined}
            aria-label={`${index + 1}. ${item.label}`} onClick={() => !closing.current && player.go(index)}>
            <span className="first-welcome__track"><i style={{ transform: `scaleX(${index < player.step ? 1 : index === player.step ? player.progress : 0})` }} /></span><span>{item.label}</span>
          </button>)}
        </nav>
        <button type="button" className="first-welcome__next" disabled={player.final} aria-label="Next chapter" onClick={() => player.go(player.step + 1)}>→</button>
      </footer>
      <p className="sr-only" role="status" aria-live="polite">{beat.title} {beat.body} {beat.note}</p>
    </div>
  );
}
