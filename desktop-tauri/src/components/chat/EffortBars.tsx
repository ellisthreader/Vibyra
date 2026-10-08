/** Four rising bars filled to a level's place on its model's ladder. */
export function EffortBars({ index, count }: { index: number; count: number }) {
  const filled = count <= 0 || index < 0 ? 0 : Math.max(1, Math.round(((index + 1) / count) * 4));
  return <svg className="effort-bars" width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
    {[0, 1, 2, 3].map(bar => <rect key={bar} x={bar * 3.6} y={9 - bar * 2.6} width="2.4" height={3 + bar * 2.6} rx="1" className={bar < filled ? 'is-on' : ''} />)}
  </svg>;
}
