import type { CSSProperties } from "react";

/** Scripted sample activity only. This demo never invokes a provider or native command. */
const terminals = [
  ['› Build a homepage for the studio', '', 'Read project instructions', 'Inspected src/app and components', '', '+ Added a responsive project grid', '+ Added a clear contact section', '', 'src/app/page.tsx       +48 −12', 'src/styles/home.css    +36  −8', '', '✓ TypeScript checks passed', '', 'Ready for your review.'],
  ['✳ Claude Code', '/Projects/Studio', '', '> Refine spacing and typography', '', 'Reviewing the homepage layout…', '', '• Consistent spacing between sections', '• Clear heading hierarchy', '• Comfortable mobile touch targets', '', '✓ Updated 2 style files', '✓ Responsive layout verified', '', 'The design is ready to preview.'],
  ['✦ Gemini', '', '> Review keyboard and screen-reader access', '', 'Checking navigation and form controls…', '', '✓ Every input has a visible label', '✓ Navigation works with a keyboard', '✓ Focus indicators remain visible', '✓ Images have descriptive alt text', '', 'Review complete. Notes saved to', 'docs/accessibility.md'],
  ['~/Projects/Studio  main', '$ npm run dev', '', 'VITE  ready in 284 ms', '', '➜ Local: http://localhost:5173/', '', 'Watching for file changes…', '', '09:41:02  page updated', '09:41:04  styles updated', '', '✓ Build complete'],
];
const reveal = (text: string, time: number, start: number, speed = 70) => text.slice(0, Math.max(0, Math.floor((time - start) * speed)));
export const ramp = (time: number, start: number, duration = 1) => Math.max(0, Math.min(1, (time - start) / duration));
export const ease = (value: number) => 1 - Math.pow(1 - value, 3);

export function WelcomeTerminal({ time, index }: { time:number; index:number }) {
  const output = reveal(terminals[index].join('\n'), time, .75, 65);
  return <div className="welcome-demo-terminal">
    {output.split('\n').map((line,row) => <div key={row} data-tone={/^[+✓]/.test(line) ? 'success' : /^[›>✳✦➜]/.test(line) ? 'accent' : undefined}>
      {line || '\u00a0'}
    </div>)}
    <i className="welcome-demo-caret" style={{opacity:time % .8 < .5 ? 1 : 0}} />
  </div>;
}

const prompt = 'Summarise the research for our new studio website.';
const answer = 'Here are three clear priorities for the new website:\n\n1. Lead with selected work, so visitors can see your strengths.\n\n2. Give each project a short story: the brief, the approach and the result.\n\n3. Make contacting the studio a simple next step.\n\nI can turn this into a page-by-page content brief next.';
export function WelcomeAgentActivity({ time }: { time: number }) {
  const sent = time >= 2;
  return <>
    <div className="welcome-demo-thread">
      <div className="welcome-demo-question" style={{ opacity: ramp(time, 2, .3), transform: `translateY(${(1 - ease(ramp(time, 2, .5))) * 30}px)` }}>{prompt}</div>
      <div className="welcome-demo-answer" style={{ opacity: ramp(time, 2.7, .3) }}>
        {time < 3.3 ? <span className="welcome-demo-thinking">{[0, 1, 2].map(i => <i key={i} style={{ transform: `translateY(${Math.sin(time * 7 - i) * 3}px)` }} />)}</span> : reveal(answer, time, 3.3, 75)}
      </div>
    </div>
    <div className="welcome-demo-composer">{sent ? <span>Message Research assistant</span> : <>{reveal(prompt, time, .25, 34)}<i className="welcome-demo-caret" /></>}</div>
  </>;
}

export function WelcomeDemoCursor({ time }: { time:number }) {
  const target = [96, 94];
  const move = ease(ramp(time, .1, 1.4));
  const click = ramp(time, 1.5, .7);
  return <div className="welcome-demo-cursor" style={{ left: `${55 + (target[0] - 55) * move}%`, top: `${72 + (target[1] - 72) * move}%`, opacity: 1 - ramp(time, 2.2, .5) } as CSSProperties}>
    <i style={{ opacity: 1 - click, transform: `translate(-50%,-50%) scale(${click * 3})` }} />
    <svg viewBox="0 0 24 28" width="21" height="25"><path d="M3 2v21l6-5 4 8 4-2-4-8h8z" fill="var(--text)" stroke="var(--bg)" strokeWidth="1.5" /></svg>
  </div>;
}
