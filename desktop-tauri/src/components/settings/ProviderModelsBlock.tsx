import '../../styles/settings-provider-connections.css';
import { useEffect, useRef, useState } from 'react';
import { listProviderModels, providerStatus, removeProviderKey, saveProviderKey, type ProviderStatus } from '../../ipc/providerModels';
import { providerPresets } from '../../lib/providerPresets';
import { SettingRow, SettingsBlock, Switch, type SettingsPaneProps } from './SettingsShared';

/** Every card has a working transport; credentials stay in native secure storage. */
export function ProviderModelsBlock({ settings, update }: SettingsPaneProps) {
  const selected = settings.providerModel;
  const [provider, setProvider] = useState(selected?.provider || 'openrouter');
  const [key, setKey] = useState('');
  const [model, setModel] = useState(selected?.model || '');
  const [models, setModels] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const epoch = useRef(0);
  const status = statuses.find(item => item.provider === provider);
  useEffect(() => {
    let alive = true;
    void providerStatus().then(value => { if (alive) setStatuses(value); }).catch(cause => { if (alive) setError(String(cause)); });
    return () => { alive = false; epoch.current++; };
  }, []);
  const choose = (id: string) => {
    epoch.current++; setProvider(id); setKey(''); setModel(selected?.provider === id ? selected.model : '');
    setModels([]); setError(''); setNotice('');
  };
  const run = async (action: () => Promise<void>) => {
    const generation = epoch.current;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (cause) { if (epoch.current === generation) setError(String(cause)); }
    finally { if (epoch.current === generation) setBusy(false); }
  };
  const save = async () => {
    if (!model.trim()) throw new Error('Choose or enter a model ID.');
    if (key.trim()) await saveProviderKey(provider, key);
    else if (!status?.configured) throw new Error('Add this provider’s key first.');
    // Only a deliberate selection routes assistant chat. Never enables a different provider on removal.
    await update({ providerModel: { enabled: true, provider, model: model.trim() },
 });
    setStatuses(await providerStatus()); setKey(''); setNotice('Provider selected for assistant chats.');
  };
  return <SettingsBlock label="AI providers" panel="aiProviders"
    note="Connect your own API accounts. Choose models from OpenRouter, xAI, DeepSeek, Mistral or OpenAI.">
    <div className="settings-group provider-connections">
      <div className="provider-connections__list" aria-label="AI providers">
        {providerPresets.map(item => <button key={item.id} className={`provider-choice${provider === item.id ? ' provider-choice--selected' : ''}`}
          aria-pressed={provider === item.id} disabled={busy} onClick={() => choose(item.id)}>
          <span className="provider-choice__name">{item.name}</span><span className="provider-choice__detail">{item.detail}</span>
          <span className="provider-choice__status">{selected?.enabled && selected.provider === item.id ? 'Active' :
            statuses.some(status => status.provider === item.id && status.configured) ? 'Saved' : 'Connect'}</span>
        </button>)}
      </div>
      <SettingRow label="API key" hint={status?.configured ? `Saved securely ${status.hint}. Leave blank to keep.` : 'Kept in this computer’s secure storage.'}>
        <input className="input provider-connection-input" aria-label="Provider API key" type="password" autoComplete="new-password" value={key}
          disabled={busy} onChange={event => setKey(event.target.value)} placeholder="Paste provider key" />
      </SettingRow>
      <SettingRow label="Model" hint="Use the provider’s exact model ID.">
        <input className="input provider-connection-input" aria-label="Provider model ID" value={model} list="provider-models"
          disabled={busy} onChange={event => setModel(event.target.value)} placeholder="Choose or enter a model" />
        <datalist id="provider-models">{models.map(id => <option key={id} value={id} />)}</datalist>
        <button className="btn btn--compact" disabled={busy} onClick={() => void run(async () => {
          const found = await listProviderModels(provider, key); setModels(found);
          setNotice(`${found.length} models available. Choose a model from the field above.`);
        })}>{busy ? 'Connecting…' : 'Find models'}</button>
      </SettingRow>
      <SettingRow label="Assistant chats" hint="Sent directly to this provider and billed by it, using no Vibyra tokens. Spoken conversations still use Vibyra.">
        <button className="btn btn--primary" disabled={busy} onClick={() => void run(save)}>Save and use provider</button>
        {selected?.provider === provider && <Switch label="Use this AI provider" checked={selected.enabled} disabled={busy || !status?.configured}
          onChange={enabled => void run(() => update({ providerModel: { ...selected, enabled },
 }))} />}
      </SettingRow>
      {status?.configured && <SettingRow label="Remove connection" hint="Delete this provider’s saved API key.">
        <button className="btn btn--compact" disabled={busy} onClick={() => void run(async () => {
          if (selected?.provider === provider) await update({ providerModel: { ...selected, enabled: false } });
          await removeProviderKey(provider); setStatuses(await providerStatus()); setKey(''); setNotice('Provider key removed.');
        })}>Remove</button>
      </SettingRow>}
    </div>
    {(error || notice) && <p className={error ? 'integration-error' : 'settings-block__note'} role="status">{error || notice}</p>}
  </SettingsBlock>;
}
