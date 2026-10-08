import { useState } from 'react';
import { kindInfo, webhookSteps, type Trigger, type Webhook } from '../../../../mobile/src/agents/v2/triggersModel.ts';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setState('copied'); } catch { setState('failed'); }
    setTimeout(() => setState('idle'), 2000);
  };
  return <button type="button" aria-label={label} onClick={() => void copy()}>{state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy' : 'Copy'}</button>;
}

function CopyField({ label, value }: { label: string; value: string }) {
  return <div className="webhook-field"><span>{label}</span><code>{value}</code><CopyButton text={value} label={`Copy ${label.toLowerCase()}`} /></div>;
}

const typesOf = (t: Trigger) => (Array.isArray(t.filter?.types) ? (t.filter.types as unknown[]).filter((x): x is string => typeof x === 'string') : []);

/** The steps to add a GitHub/Stripe webhook; `secret` is only ever the one just returned, never stored. */
export function WebhookSteps({ trigger, url, secret }: { trigger: Trigger; url: string; secret?: string | null }) {
  return <>
    <CopyField label="Webhook URL" value={url} />
    {secret && <CopyField label="Secret" value={secret} />}
    <ol className="webhook-steps">{webhookSteps(trigger.kind, typesOf(trigger)).map(step => <li key={step}>{step}</li>)}</ol>
  </>;
}

/** Shown once, right after a webhook trigger is created. */
export function WebhookCard({ trigger, webhook, onDone }: { trigger: Trigger; webhook: Webhook; onDone(): void }) {
  const github = trigger.kind.startsWith('github.');
  return <div className="webhook-card" role="group" aria-label="Webhook setup">
    <h4>Finish setting up the {kindInfo(trigger.kind)?.label ?? 'webhook'} trigger</h4>
    <p className="profile-help">{github ? 'Copy the secret now. It is shown only this once; delete and recreate the trigger if you lose it.'
      : 'Stripe gives you a signing secret once the endpoint exists. Paste it into the trigger below.'}</p>
    <WebhookSteps trigger={trigger} url={webhook.url} secret={webhook.secret} />
    <div className="routine-actions"><button type="button" className="primary" onClick={onDone}>I’ve saved it</button></div>
  </div>;
}
