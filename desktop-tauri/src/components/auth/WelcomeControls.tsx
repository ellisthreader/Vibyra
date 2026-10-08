import type { WelcomeBeat } from "../../lib/firstWelcomePolicy";

interface WelcomeControlsProps {
  beats: WelcomeBeat[];
  step: number;
  progress: number;
  paused: boolean;
  disabled: boolean;
  onToggle: () => void;
  onSeek: (step: number) => void;
}

export function WelcomeControls({ beats, step, progress, paused, disabled, onToggle, onSeek }: WelcomeControlsProps) {
  return <footer className="first-welcome__footer">
    <div className="first-welcome__transport">
      <button type="button" className="first-welcome__play" disabled={disabled}
        aria-label={paused ? "Play introduction" : "Pause introduction"}
        title={paused ? "Play introduction" : "Pause introduction"} onClick={onToggle}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          {paused ? <path d="M6 3.8v12.4L16 10z" /> : <><rect x="5" y="4" width="3" height="12" rx="1" /><rect x="12" y="4" width="3" height="12" rx="1" /></>}
        </svg>
      </button>
      <nav className="first-welcome__chapters" aria-label="Introduction chapters">
        {beats.map((beat, index) => <button type="button" key={beat.label} disabled={disabled}
          aria-current={step === index ? "step" : undefined} aria-label={`${index + 1}. ${beat.label}`}
          data-complete={index < step} title={beat.label} onClick={() => onSeek(index)}>
          <span className="first-welcome__track"><i style={{ transform: `scaleX(${index < step ? 1 : index === step ? progress : 0})` }} /></span>
          <span>{beat.shortLabel ?? beat.label}</span>
        </button>)}
      </nav>
      <button type="button" className="first-welcome__next" disabled={disabled || step === beats.length - 1}
        aria-label="Next chapter" title="Next chapter · →" onClick={() => onSeek(step + 1)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
      </button>
    </div>
  </footer>;
}
