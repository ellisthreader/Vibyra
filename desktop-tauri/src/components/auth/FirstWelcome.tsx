import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { vibyraLogoUrl as logoUrl } from "../../assets/vibyraLogo";
import { firstWelcomeBeats, rememberFirstWelcome, WELCOME_DURATIONS } from "../../lib/firstWelcomePolicy";
import { useWelcomePlayback } from "../../lib/useWelcomePlayback";
import { useModalFocus } from "../../lib/useModalFocus";
import { WelcomeArtwork } from "./WelcomeArtwork";
import { preloadWelcomeImages } from "./WelcomeScreens";
import { WelcomeScene } from "./WelcomeScene";
import { WelcomeControls } from "./WelcomeControls";
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
  const beats = useMemo(() => firstWelcomeBeats(profile.name), [profile.name]);
  const beat = beats[player.step];
  const still = player.reduced || (player.paused && player.progress === 0);

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
  const finish = useCallback(() => requestClose(true), [requestClose]);
  useModalFocus(dialogRef, true, closeFromEscape);
  useEffect(() => {
    // WebKit does not focus a button after a mouse click. Own these keys for the modal.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || closing.current) return;
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      event.stopPropagation();
      player.go(player.step + (event.key === "ArrowRight" ? 1 : -1));
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [player.go, player.step]);

  return (
    <div className={`first-welcome${leaving ? " first-welcome--leaving" : ""}`}
      role="dialog" aria-modal="true" aria-labelledby="first-welcome-title" ref={dialogRef}
      data-step={player.step} data-playing={player.playing && !leaving}>
      <div className="first-welcome__atmosphere" aria-hidden="true" />
      <header className="first-welcome__header">
        <div className="first-welcome__brand"><img src={logoUrl} alt="" />Vibyra</div>
        <button type="button" className="first-welcome__skip" disabled={leaving} onClick={closeFromEscape}>Skip intro <kbd aria-hidden="true">esc</kbd></button>
      </header>
      <main className="first-welcome__stage">
        {beats.map((item, index) => <WelcomeScene key={item.label} beat={item} index={index}
          activeStep={player.step} time={still || index < player.step ? 3 : index === player.step ? player.progress * WELCOME_DURATIONS[player.step] / 1000 : 0}
          manual={player.paused} onFinish={finish} />)}
        <WelcomeArtwork step={player.step} time={player.progress * WELCOME_DURATIONS[player.step] / 1000} reduced={still} playing={player.playing && !leaving} />
        <p className="first-welcome__note" data-visible={Boolean(beat.note)}>{beat.note ?? "\u00a0"}</p>
      </main>
      <WelcomeControls beats={beats} step={player.step} progress={player.progress} paused={player.paused}
        disabled={leaving} onToggle={player.toggle} onSeek={index => !closing.current && player.go(index)} />
      <p className="sr-only" role="status" aria-live="polite">{beat.title} {beat.body} {beat.note}</p>
    </div>
  );
}
