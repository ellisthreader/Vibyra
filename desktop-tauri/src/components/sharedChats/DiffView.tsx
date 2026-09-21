import { useState } from 'react';
import { relativeChangePath } from '../../../../mobile/src/conversation/usageSummary';
import { diffLines, splitDiff, type DiffLine } from '../../../../mobile/src/conversation/diffLines';
export function DiffView({ content, root }: { content: string; root?: string | null }) {
  const [split, setSplit] = useState(false);
  let changes: { path: string; diff: string; kind?: { type: string; move_path?: string } }[] = [];
  try { const parsed: unknown = JSON.parse(content); if (Array.isArray(parsed)) changes = parsed; } catch { /* legacy text */ }
  if (!changes.length) return <pre className="inspector-output">{content || 'No patch was supplied for this operation.'}</pre>;
  return <div className="conversation-diffs"><div className="diff-mode" role="group" aria-label="Diff layout">
    <button aria-pressed={!split} onClick={() => setSplit(false)}>Unified</button><button aria-pressed={split} onClick={() => setSplit(true)}>Split</button></div>
    {changes.map((change, i) => <section key={i} className="conversation-diff"><header><strong>{relativeChangePath(change.path, root)}</strong>
      <small>{change.kind?.move_path ? `Renamed to ${change.kind.move_path}` : change.kind?.type === 'add' ? 'Created' : change.kind?.type === 'delete' ? 'Deleted' : 'Modified'}</small></header>
      {change.diff ? <div className="diff-lines">{split ? splitDiff(diffLines(change.diff)).map((row, n) => row.header ? <Line key={n} line={row.header} />
        : <div className="diff-split-row" key={n}><Line line={row.left} side="old" /><Line line={row.right} side="new" /></div>)
        : diffLines(change.diff).map((line, n) => <Line key={n} line={line} />)}</div> : <p>Binary file or patch unavailable.</p>}
    </section>)}
  </div>;
}
function Line({ line, side }: { line?: DiffLine; side?: 'old' | 'new' }) {
  return <div className={`diff-line diff-line--${line?.kind ?? 'empty'}`}><span aria-hidden="true">{side === 'new' ? line?.newLine : line?.oldLine}</span>
    {!side && <span aria-hidden="true">{line?.newLine}</span>}<code>{line?.text || ' '}</code></div>;
}
