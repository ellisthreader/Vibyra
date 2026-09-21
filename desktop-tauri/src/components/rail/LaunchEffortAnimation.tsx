import { useEffect, useRef } from 'react';
import { claudeRippleCell, ignitionColumn, ignitionDuration, ignitionHues, RAINBOW, type IgnitionStyle } from '../../lib/effortAnimation';
import '../../styles/launch-effort-animation.css';

export function LaunchEffortAnimation({ provider, effort }: { provider?: string; effort: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const previous = useRef<IgnitionStyle | null>(null);
  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext('2d');
    if (!node || !context) return;
    const row = node.parentElement!;
    const ripple = provider === 'claude' && effort === 'ultracode';
    const rainbow = provider === 'claude' && effort === 'max';
    const codex = provider === 'codex' && (effort === 'max' || effort === 'ultra');
    if (!ripple && !rainbow && !codex) { context.clearRect(0, 0, node.width, node.height); delete node.dataset.effect; return; }
    const choices: IgnitionStyle[] = ['wave', 'aurora', 'pulse'];
    const allowed = choices.filter(style => style !== previous.current);
    const style = allowed[Math.floor(Math.random() * allowed.length)];
    if (codex) previous.current = style;
    node.dataset.effect = ripple ? 'violet-ripple' : rainbow ? 'rainbow-label' : style;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, elapsed = 0, last = 0, painted = -Infinity, finished = false;
    let width = 0, height = 0;
    let textCells: { element: HTMLElement; x: number; y: number }[] = [];
    const resize = () => {
      width = row.clientWidth; height = row.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      node.width = width * ratio; node.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const bounds = row.getBoundingClientRect();
      textCells = Array.from(row.querySelectorAll<HTMLElement>('label, output span, small, .launch-effort__ends span')).map(element => {
        const box = element.getBoundingClientRect();
        return { element, x: (box.left + box.width / 2 - bounds.left) / 8, y: (box.top + box.height / 2 - bounds.top) / 16 };
      });
      painted = -Infinity;
    };
    const draw = () => {
      context.clearRect(0, 0, width, height);
      const label = row.querySelector<HTMLOutputElement>('output');
      const light = document.documentElement.dataset.theme === 'light';
      const columns = Math.ceil(width / 8);
      if (ripple) {
        for (let y = 0; y < Math.ceil(height / 16); y++) for (let x = 0; x < columns; x++) {
          const color = claudeRippleCell(elapsed, x, y, columns - 4);
          if (color) { context.fillStyle = color; context.fillRect(x * 8, y * 16, 8, 16); }
        }
        for (const { element, x, y } of textCells) element.style.color = claudeRippleCell(elapsed, x, y, columns - 4) ? '#fff' : '';
      } else if (rainbow) {
        label?.querySelectorAll<HTMLElement>('span').forEach((letter,i) => { letter.style.color = RAINBOW[(i + Math.floor(elapsed / 100)) % RAINBOW.length]; });
      } else {
        for (let x = 0; x < columns; x++) {
          const color = ignitionColumn(style, effort as 'max' | 'ultra', elapsed, x, columns, light);
          if (color) { context.fillStyle = color.color; context.globalAlpha = color.alpha; context.fillRect(x * 8, 0, 8, height); }
        }
        context.globalAlpha = 1;
        if (style === 'wave' && effort === 'ultra' && elapsed >= 900 && elapsed < 1200) {
          context.fillStyle = `rgb(${ignitionHues('ultra', light)[0].join(',')})`;
          context.font = 'bold 14px monospace'; context.fillText(['·','✦','✧'][Math.floor((elapsed - 900) / 100)], width - 16, 12);
        }
        finished = elapsed >= ignitionDuration(style, effort as 'max' | 'ultra');
      }
      node.dataset.frame = String(Math.floor(elapsed));
    };
    const stopped = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.performance === 'on' || document.hidden;
    const tick = (now: number) => {
      frame = 0;
      if (stopped()) { sync(); return; }
      if (finished) return;
      if (last) elapsed += now - last;
      last = now;
      const interval = ripple ? 80 : rainbow ? 100 : 33;
      if (elapsed - painted >= interval) { draw(); painted = elapsed; }
      if (!finished) frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      row.dataset.motion = stopped() ? 'still' : 'live';
      if (!stopped() && !finished) frame = requestAnimationFrame(tick);
      else { context.clearRect(0,0,width,height); for (const { element } of textCells) element.style.color = ''; }
    };
    resize(); sync();
    const observer = new ResizeObserver(() => { resize(); }); observer.observe(row);
    const preferences = new MutationObserver(sync); preferences.observe(document.documentElement, { attributes: true, attributeFilter: ['data-performance', 'data-theme'] });
    motion.addEventListener('change', sync); document.addEventListener('visibilitychange', sync);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); preferences.disconnect(); motion.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync); delete row.dataset.motion; for (const { element } of textCells) element.style.color = ''; };
  }, [provider, effort]);
  return <canvas ref={canvas} className="launch-effort-animation" aria-hidden="true" />;
}
