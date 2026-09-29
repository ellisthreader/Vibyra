import { objectValue, requiredList, requiredObject } from '../transport/responseShape';
import type { FundedModel, VibesApi, VibesChat } from './types';

/** All pages from one snapshot; a partial or mixed catalogue never replaces a good one. */
export function fundedApi(call: (path: string, body?: object) => Promise<Record<string, unknown>>): Pick<VibesApi, 'terminalModels' | 'createTerminal' | 'closeTerminal'> {
  return {
    terminalModels: async () => {
      const models: FundedModel[] = [];
      let page: number | null = 1;
      let revision: string | null = null;
      while (page !== null) {
        const data = await call(`terminal-models?page=${page}${revision ? `&revision=${encodeURIComponent(revision)}` : ''}`);
        if (data.version !== 1 || data.source !== 'vibyra' || typeof data.revision !== 'string' ||
          (revision !== null && revision !== data.revision) || (data.next !== null && data.next !== page + 1))
          throw new Error('The model list changed. Try again.');
        models.push(...requiredList<FundedModel>(data.models, 'Token models', row =>
          objectValue(row) && typeof row.id === 'string' && typeof row.name === 'string' && typeof row.available === 'boolean' &&
          typeof row.tools === 'boolean' && row.source === 'vibyra'));
        revision = data.revision;
        page = data.next as number | null;
      }
      return models;
    },
    createTerminal: async launch => requiredObject<VibesChat>((await call('terminals', launch)).session, 'Token terminal',
      row => row.id === launch.id && Boolean(row.terminal_tools) === launch.tools && row.terminal_model === launch.model && row.host_id === launch.hostId && row.project_id === launch.projectId),
    closeTerminal: async id => { await call(`terminals/${encodeURIComponent(id)}/close`, {}); },
  };
}
