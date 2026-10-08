import { useEffect, useRef } from "react";

export function PhoneConnectionResult({ onDone }: { onDone(): void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, []);
  return <div className="phone-connect__result">
    <div className="phone-connect__confirmation" aria-hidden="true">
      <svg className="phone-connect__ring" viewBox="0 0 88 88">
        <circle className="phone-connect__track" cx="44" cy="44" r="41" />
        <circle className="phone-connect__draw" cx="44" cy="44" r="41" pathLength="1" />
      </svg>
      <div className="phone-connect__disc"><svg viewBox="0 0 32 32">
        <path d="m8 16 5.5 5.5L24 11" pathLength="1" />
      </svg></div>
    </div>
    <h2 ref={title} id="phone-connect-title" tabIndex={-1}>Connected</h2>
    <p id="phone-connect-description">Your iPhone is ready.</p>
    <button className="btn phone-connect__done" onClick={onDone}>Done</button>
  </div>;
}
