import { computerName } from "../../lib/platform";
import { providerPreference } from '../../../../mobile/src/agents/engineProviders';
import { ProfileEditor } from './ProfileEditor';
import { restoreSetup } from './setupStorage';
import { useRef, useState } from 'react';
import { message, teammateApi } from './api';
import type { Roster, Teammate } from './types';
import { AgentComputerGrant } from './AgentComputerGrant';
export function Setup({ agent, identity, enabled, localComputer, onClose, onSaved }: { agent?: Teammate; identity: string; enabled: boolean; localComputer: boolean; onClose(): void; onSaved(agent: Teammate): void }) {
  const storage = `teammate-setup.${encodeURIComponent(identity)}.${agent?.id ?? 'new'}`;
  const [restored] = useState(() => { try { return restoreSetup(localStorage.getItem(storage), agent); } catch { return restoreSetup('invalid', agent); } });
  const [fields, setFields] = useState(restored.fields);
  const [baseRevision] = useState(restored.revision);
  const [pending, setPending] = useState<Record<string, unknown> | null>(restored.pending);
  const [skillEditing, setSkillEditing] = useState(false);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(restored.error);
  const update = (key: string, value: unknown) => { const next = { ...fields, [key]: value }; setFields(next); try { localStorage.setItem(storage, JSON.stringify({ fields: next, pending, revision: baseRevision })); } catch { setError(`Setup could not be saved on this ${computerName}.`); } };
  const save = async () => {
    if (lock.current || !enabled || restored.error) return; lock.current = true; setBusy(true); setError('');
    try {
      const body = pending ?? { ...fields, model: providerPreference(fields.model), ...(agent ? { revision: baseRevision } : { id: crypto.randomUUID() }) };
      localStorage.setItem(storage, JSON.stringify({ fields, pending: body, revision: baseRevision })); setPending(body);
      const result = await teammateApi<{ teammate: Teammate }>(`agents/v1/teammates${agent ? '/' + agent.id : ''}`, body);
      localStorage.removeItem(storage); onSaved(result.teammate);
    } catch (e) { const detail = message(e); if (/^(400|403|404|409|422):/.test(detail)) { setPending(null); try { localStorage.setItem(storage, JSON.stringify({ fields, pending: null, revision: baseRevision })); } catch {} } setError(detail); } finally { lock.current = false; setBusy(false); }
  };
  const reloadProfile = async () => { if (!agent || busy) return; setBusy(true); try { const data = await teammateApi<Roster>('agents/v1/teammates'); const latest = data.teammates.find(a => a.id === agent.id); if (!latest) throw new Error('This teammate is no longer available.'); localStorage.removeItem(storage); onSaved(latest); } catch(e) { setError(message(e)); } finally { setBusy(false); } };
  const archive = async () => { if (!agent || lock.current) return; lock.current = true; setBusy(true); try { const result = await teammateApi<{ teammate: Teammate }>(`agents/v1/teammates/${agent.id}/archive`, { revision: agent.revision, archived: !agent.archived }); onSaved(result.teammate); } catch(e) { setError(message(e)); } finally { lock.current = false; setBusy(false); } };
  return <form className="teammate-setup teammate-profile" aria-label={agent ? 'Teammate details' : 'New teammate'} onSubmit={e => { e.preventDefault(); void save(); }}>
    <header><h2>{agent ? 'Edit teammate' : 'New teammate'}</h2><button type="button" onClick={onClose}>Back to teammates</button></header>
    <ProfileEditor storage={storage} onSkillEditing={setSkillEditing} fields={fields} update={update} disabled={Boolean(restored.error) || busy || Boolean(pending) || Boolean(agent?.archived)}
      accessExtra={agent && localComputer && !agent.archived ? <AgentComputerGrant agentId={agent.id} disabled={busy || Boolean(pending)} onChanged={reloadProfile} /> : null} />
    <footer className="profile-footer">{error && <p role="alert">{error}{agent && /changed|Reload/i.test(error) && <button type="button" disabled={busy} onClick={() => void reloadProfile()}>Discard draft & reload</button>}</p>}{pending && <p>The exact save is retained until confirmed. Retry to reconcile it.</p>}
    <div className="profile-actions"><p className="profile-help">{skillEditing ? 'Finish or cancel the skill to save your teammate.' : 'Changes are saved when you’re ready.'}</p>
    <button className="primary" disabled={Boolean(restored.error) || skillEditing || busy || !enabled || agent?.archived || !fields.name.trim() || !fields.brief.trim() || !Number.isInteger(fields.budget) || fields.budget < 1 || fields.budget > 50}>{pending ? 'Retry saved request' : agent ? 'Save changes' : 'Create teammate'}</button>
    {agent && <button type="button" disabled={skillEditing || busy || Boolean(pending)} onClick={() => void archive()}>{agent.archived ? 'Restore teammate' : 'Archive teammate'}</button>}
    </div></footer>
  </form>;
}
