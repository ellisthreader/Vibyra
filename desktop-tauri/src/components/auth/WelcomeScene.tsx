import type { WelcomeBeat } from "../../lib/firstWelcomePolicy";
import { ramp } from "./WelcomeDemoActivity";

function TypedWelcome({ text, time, start, duration }: { text: string; time: number; start: number; duration: number }) {
  const letters = Array.from(text);
  const count = Math.floor(ramp(time, start, duration) * letters.length);
  return <span aria-hidden="true">{letters.map((letter, index) => <span key={index}
    className={`first-welcome__letter${index === count - 1 && count < letters.length ? ' first-welcome__letter--cursor' : ''}`}
    style={{ opacity: index < count ? 1 : 0 }}>{letter}</span>)}</span>;
}

export function WelcomeScene({ beat, index, activeStep, time, manual, onFinish }: {
  beat: WelcomeBeat; index: number; activeStep: number; time: number; manual: boolean; onFinish: () => void;
}) {
  const active = index === activeStep;
  const bookend = index === 0 || index === 4;
  const typed = index === 0;
  const sceneTime = active ? time : index < activeStep ? 3 : 0;
  return <section className={`first-welcome__scene${bookend ? ' first-welcome__scene--bookend' : ''}`}
    data-position={active ? 'active' : index < activeStep ? 'past' : 'future'} data-scene={index}
    aria-hidden={!active} inert={!active}>
    <div className="first-welcome__copy">
      <h1 id={active ? 'first-welcome-title' : undefined} aria-label={typed ? beat.title : undefined}>
        {typed ? <>
          <span className="first-welcome__hello"><TypedWelcome text="Welcome to Vibyra," time={sceneTime} start={.08} duration={.65} /></span>
          <strong className="first-welcome__name"><TypedWelcome text={beat.title.slice('Welcome to Vibyra, '.length)} time={sceneTime} start={.74} duration={.38} /></strong>
        </> : beat.title}
      </h1>
      {beat.body && <p>{beat.body}</p>}
    </div>
    {index === 4 && manual && <button className="first-welcome__primary" type="button" onClick={onFinish}>Open Home <span aria-hidden="true">→</span></button>}
  </section>;
}
