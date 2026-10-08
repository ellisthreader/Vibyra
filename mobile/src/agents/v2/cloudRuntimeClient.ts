import { parseCloudAgentQuote as parseComputeQuote } from './cloudRuntimeQuote';
import { parseCloudAgentPage, type CloudAgentApi } from './cloudRuntimeModel';
import type { StageTwoCall } from './stageTwoModel';

/** Shared account transport: quoting never starts a computer or changes the Agent allowance. */
export function cloudAgentClient(call: StageTwoCall): CloudAgentApi {
  return {
    read: async () => parseCloudAgentPage(await call('agents/v2/cloud')),
    quote: async (deviceId, budgetUnits, deadlineSeconds) => parseComputeQuote((await call<{ quote: unknown }>('agents/v2/cloud/quote', { profile: 'standard', deviceId, budgetUnits, deadlineSeconds })).quote),
    save: async body => parseCloudAgentPage(await call('agents/v2/cloud', body, 'PUT')),
    revoke: async expectedRevision => parseCloudAgentPage(await call('agents/v2/cloud', { expectedRevision }, 'DELETE')),
  };
}
