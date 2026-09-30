import { memo, useRef } from "react";
import type { WelcomeBeat } from "../../lib/firstWelcomePolicy";
import { ease, ramp } from "./WelcomeDemoActivity";

function TypedWelcome({ text, time, start, duration }: { text: string; time: number; start: number; duration: number }) {
  const letters = Array.from(text);
  const count = Math.floor(ramp(time, start, duration) * letters.length);
  return <span aria-hidden="true">{letters.map((letter, index) => {
    const arrival = ease(ramp(time, start + index / letters.length * duration, .16));
    return <span key={index} className={`first-welcome__letter${index === count - 1 && count < letters.length ? ' first-welcome__letter--cursor' : ''}`}
      style={{ opacity: index < count ? 1 : 0, transform: `translateY(${(1 - arrival) * 8}px)` }}>{letter === ' ' ? '\u00a0' : letter}</span>;
  })}</span>;
}

function Headline({ beat }: { beat: WelcomeBeat }) {
  if (!beat.emphasis) return beat.title;
  const start = beat.title.indexOf(beat.emphasis);
  return <>{beat.title.slice(0, start)}<em>{beat.emphasis}</em>{beat.title.slice(start + beat.emphasis.length)}</>;
}

export const WelcomeScene = memo(function WelcomeScene({ beat, index, activeStep, time, manual, onFinish }: {
  beat: WelcomeBeat; index: number; activeStep: number; time: number; manual: boolean; onFinish: () => void;
}) {
  const active = index === activeStep;
  const bookend = index === 0 || index === 4;
  // Retain the outgoing frame even when seeking backwards; no disappearing text mid-dissolve.
  const heldTime = useRef(time);
  if (active) heldTime.current = time;
  const sceneTime = active ? time : heldTime.current;
  const titleArrival = ease(ramp(sceneTime, 0, .7));
  const bodyArrival = ease(ramp(sceneTime, .12, .65));
  return <section className={`first-welcome__scene${bookend ? ' first-welcome__scene--bookend' : ''}`}
    data-position={active ? 'active' : index < activeStep ? 'past' : 'future'} data-scene={index}
    aria-hidden={!active} inert={!active}>
    <div className="first-welcome__copy">
      <h1 id={active ? 'first-welcome-title' : undefined} aria-label={beat.title}>
        {index === 0 ? <>
          <span className="first-welcome__hello"><TypedWelcome text="Welcome to Vibyra," time={sceneTime} start={.06} duration={.62} /></span>
          <strong className="first-welcome__name"><TypedWelcome text={beat.title.slice('Welcome to Vibyra, '.length)} time={sceneTime} start={.7} duration={.36} /></strong>
        </> : <span className="first-welcome__headline" style={{ opacity: titleArrival, transform: `translateY(${(1 - titleArrival) * 22}px)` }}><Headline beat={beat} /></span>}
      </h1>
      {beat.body && <p style={{ opacity: bodyArrival, transform: `translateY(${(1 - bodyArrival) * 12}px)` }}>{beat.body}</p>}
    </div>
    {index === 4 && manual && <button className="first-welcome__primary" type="button" onClick={onFinish}>Open Home <span aria-hidden="true">→</span></button>}
  </section>;
});
