import { useState } from 'react';
import { PRESETS, emptySpec, type LocalSpec, type Preset } from '../../lib/localMcp';
import { SettingsBlock } from './SettingsShared';
import { LocalMcpConsent } from './LocalMcpConsent';
import { LocalMcpServer } from './LocalMcpServer';
import { useLocalMcp } from './useLocalMcp';
import type { MacHub } from './useMacHub';
import '../../styles/connections-hub.css';
import '../../styles/local-mcp.css';

interface Draft { spec: LocalSpec; preset: Preset | null }

/**
 * Local MCP servers (roadmap Part 6): programs on this Mac whose tools teammates can use. The
 * command line and secrets stay here; the account only learns a name and the tool list.
 */
export function LocalMcpBlock({ hub }: { hub: MacHub }) {
  const local = useLocalMcp(hub);
  const [adding, setAdding] = useState(false), [draft, setDraft] = useState<Draft | null>(null);
  const open = (preset: Preset | null) => { setAdding(false); setDraft({ spec: emptySpec(), preset }); };
  const confirm = async (spec: LocalSpec, secrets: Record<string, string>) => { if (await local.add(spec, secrets)) setDraft(null); };
  const editing = draft?.spec.id ? local.views?.find(v => v.spec.id === draft.spec.id) : undefined;
  return <SettingsBlock label="Local MCP servers" note="Run an MCP server on this Mac and let teammates use its tools. It starts only when a teammate needs it, runs with your own permissions, and every tool asks you first until you mark it as a read.">
    {local.onForAccount === false ? <p className="hub-note">Local servers aren’t switched on for your account yet.</p> : null}
    {local.views?.map(view => <LocalMcpServer key={view.spec.id} view={view} hub={hub} local={local}
      server={view.spec.connectionId ? hub.servers[view.spec.connectionId] : undefined} onEdit={() => setDraft({ spec: view.spec, preset: null })} />)}
    {local.views?.length === 0 ? <p className="hub-note">No local servers yet.</p> : null}
    {local.error && !draft ? <p className="hub-error" role="alert">{local.error}</p> : null}
    {local.onForAccount ? <div className="hub-actions"><button type="button" className="btn btn--primary btn--compact" aria-expanded={adding} disabled={local.busy !== null} onClick={() => setAdding(!adding)}>Add a local server</button></div> : null}
    {adding ? <div className="hub-catalogue" aria-label="Starter servers">
      {PRESETS.map(p => <div key={p.id} className="hub-provider"><span><strong>{p.name}</strong><small>{p.blurb}</small></span>
        <button type="button" className="btn btn--ghost btn--compact" aria-label={`Add ${p.name}`} onClick={() => open(p)}>Add</button></div>)}
      <div className="hub-provider"><span><strong>Your own command</strong><small>Any MCP server that talks over standard input and output.</small></span>
        <button type="button" className="btn btn--ghost btn--compact" aria-label="Add your own command" onClick={() => open(null)}>Add</button></div>
    </div> : null}
    {draft ? <LocalMcpConsent initial={draft.spec} preset={draft.preset} secretsSaved={editing?.secretsSaved ?? []} busy={local.busy?.startsWith('add:') ?? false}
      error={local.error} onCancel={() => setDraft(null)} onConfirm={(spec, secrets) => void confirm(spec, secrets)} /> : null}
  </SettingsBlock>;
}
