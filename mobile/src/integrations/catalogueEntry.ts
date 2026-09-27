import type { Integration } from './types';

type Entry = Omit<Integration, 'mention' | 'writes' | 'installed' | 'account' | 'connectedAt'> & {
  writes?: string;
};
export const integration = (entry: Entry): Integration => ({
  ...entry,
  mention: '@' + entry.id,
  writes: entry.writes ?? null,
  installed: false,
  account: null,
  connectedAt: null,
});
