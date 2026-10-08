import { HubMark } from './HubMark';
import { presetMark } from './brandMark';
import type { McpPreset } from '../../../../mobile/src/agents/v2/connectionsModel.ts';

/**
 * Popular services: one tap adds the MCP server with its address and name filled in, then sign-in
 * opens in the browser exactly as it does for a typed address. Nothing renders without presets
 * (remote MCP off, an older server, or every one already added), and the manual form stays below.
 */
export function PopularServices({ presets, busy, onAdd, onCancel }: { presets: McpPreset[]; busy: string | null; onAdd(preset: McpPreset): void; onCancel(): void }) {
  if (!presets.length) return null;
  return <section className="hub-popular" aria-labelledby="hub-popular-title">
    <h4 id="hub-popular-title">Popular</h4>
    <div className="hub-catalogue">
      {presets.map(p => {
        const waiting = busy === `mcp:preset:${p.id}`;
        return <div key={p.id} className="hub-provider" data-testid={`preset-${p.id}`}>
          <HubMark id={p.id} brand={presetMark(p)} label={p.name} />
          <span><strong>{p.name}</strong><small>{[p.category, p.tagline].filter(Boolean).join(' · ')}</small></span>
          {waiting ? <button type="button" className="btn btn--ghost btn--compact" onClick={onCancel}>Stop waiting</button> : null}
          <button type="button" className="btn btn--primary btn--compact" aria-label={`Add ${p.name}`} disabled={busy !== null} onClick={() => onAdd(p)}>{waiting ? 'Waiting for browser…' : 'Add'}</button>
        </div>;
      })}
    </div>
  </section>;
}
