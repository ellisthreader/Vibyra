import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IntegrationsProvider, useIntegrations } from '../src/integrations/IntegrationsProvider';
import { fallbackIntegrations } from '../src/integrations/catalogue';
import type { IntegrationCatalogue, IntegrationsApi } from '../src/integrations/types';

let owner = 'first';
let reads = 0;
let complete: (() => void) | undefined;
const snapshot = (account = owner): IntegrationCatalogue => ({ enabled: true,
  integrations: fallbackIntegrations.map(entry => ({ ...entry, installed: entry.id === 'github', account })) });
const api: IntegrationsApi = {
  catalogue: async () => { reads += 1; return snapshot(); },
  connect: async () => snapshot(),
  disconnect: async () => snapshot(),
  authorize: async () => {
    const result = snapshot();
    await new Promise<void>(resolve => { complete = resolve; });
    return { catalogue: result };
  },
};
function State() {
  const value = useIntegrations();
  const [error, setError] = useState('');
  return <>
    <output>{JSON.stringify({ live: value.live, busy: value.busy, account: value.installed[0]?.account, error, reads })}</output>
    <button onClick={() => { void value.authorize('github').catch(e => setError(e.message)); }}>Authorize</button>
    <button onClick={() => { void value.authorize('stripe').catch(e => setError(e.message)); }}>Second request</button>
    <button onClick={() => { void value.refresh(); }}>Refresh</button>
    <button onClick={() => complete?.()}>Complete old request</button>
  </>;
}
function Fixture() {
  const [identity, setIdentity] = useState(owner);
  return <>
    <button onClick={() => { owner = 'second'; setIdentity(owner); }}>Switch account</button>
    <IntegrationsProvider api={api} identity={identity}><State /></IntegrationsProvider>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
