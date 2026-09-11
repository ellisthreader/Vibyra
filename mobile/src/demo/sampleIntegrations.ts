import { fallbackIntegrations } from '../integrations/catalogue';
import type { IntegrationCatalogue, IntegrationsApi } from '../integrations/types';

/**
 * The sample workspace can show what an integration is and what it would read,
 * but it has no account to connect one to. `enabled: false` is what the page reads to
 * say so, and every write rejects rather than pretending to have succeeded.
 */
const refuse = async (): Promise<never> => { throw new Error('Sign in to connect an integration.'); };
const catalogue: IntegrationCatalogue = { enabled: false, integrations: fallbackIntegrations };
export const sampleIntegrationsApi: IntegrationsApi = {
  catalogue: async () => catalogue,
  connect: refuse, disconnect: refuse,
};
