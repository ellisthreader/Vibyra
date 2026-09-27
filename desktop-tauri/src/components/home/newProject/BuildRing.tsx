import type { RunPhase } from '../../../state/projectCreateStore';

const SIZE = 168;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * The build, as one thing to watch. A ring that fills step by step, a second
 * arc sweeping round it while Rust is actually working, and the count in the
 * middle.
 *
 * The sweep is the honest part. A step reports that it has started, not how far
 * through it is, so the ring holds at that step's share and the sweep says work
 * is still happening. A bar that crept forward on a timer would be inventing
 * progress it has not been told about.
 *
 * Reduce Motion gets the ring and the numbers and none of the movement; the
 * sweep is a CSS animation, so `prefers-reduced-motion` in the sheet is all it
 * takes to stop it.
 */
export function BuildRing({ phase, index, total, label }: {
  phase: RunPhase; index: number; total: number; label: string;
}) {
  const running = phase === 'running';
  const done = phase === 'done';
  const share = total > 0 ? Math.min(index / total, 1) : 0;
  const fraction = done ? 1 : share;
  const shown = done ? total : Math.min(index + (running ? 1 : 0), total);

  return <div className={`np-ring np-ring--${phase}`} role="progressbar" aria-label={label}
    aria-valuemin={0} aria-valuemax={total} aria-valuenow={done ? total : index}>
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
      <circle className="np-ring__track" cx={SIZE / 2} cy={SIZE / 2} r={R} strokeWidth={STROKE} fill="none" />
      {running && <circle className="np-ring__sweep" cx={SIZE / 2} cy={SIZE / 2} r={R} strokeWidth={STROKE}
        fill="none" strokeLinecap="round"
        strokeDasharray={`${CIRCUMFERENCE * 0.24} ${CIRCUMFERENCE}`} />}
      <circle className="np-ring__fill" cx={SIZE / 2} cy={SIZE / 2} r={R} strokeWidth={STROKE} fill="none"
        strokeLinecap="round" strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} />
    </svg>
    <div className="np-ring__middle">
      {done
        ? <span className="np-ring__tick">✓</span>
        : <><span className="np-ring__count">{shown}</span><span className="np-ring__of">of {total || 1}</span></>}
    </div>
  </div>;
}
