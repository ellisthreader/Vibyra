/**
 * Which account an approval card names (security review F-07). The card always shows the account
 * label the server sent; when the teammate may use more than one account of that provider it also
 * shows the last four characters of the connection id, so two accounts that share a label (or an
 * injected call that picked the other account) cannot look alike. Pure, shared by the phone and the Mac.
 */
import type { HubConnection } from './connectionsModel';

/** The connection list as a card sees it: still loading (`null`), unreadable, or the account list. */
export type GrantedAccounts = readonly HubConnection[] | 'failed' | null;

/** Four lowercase letters or digits from the end of the id; nothing else can reach the card. */
export const connectionSuffix = (id: string | null | undefined): string =>
  (id ?? '').replace(/[^0-9a-z]/gi, '').toLowerCase().slice(-4);

/** How many accounts of `provider` this teammate holds a grant on. */
export const grantedAccountCount = (connections: readonly HubConnection[], agentId: string, provider: string): number =>
  connections.filter(c => c.provider === provider && c.teammates.some(t => t.agentId === agentId)).length;

/**
 * The count a card acts on. While the list loads nothing extra is added (the label is already there);
 * if it could not be read the id is always shown, because "only one account" is then unproven.
 */
export const accountsGranted = (list: GrantedAccounts, agentId: string, provider: string): number =>
  list === 'failed' ? 2 : list ? grantedAccountCount(list, agentId, provider) : 1;

/** The account line: `team@example.com`, or `team@example.com · a1b2` when several are granted. */
export function approvalAccount(account: string | null | undefined, connectionId: string | null | undefined, granted: number): string | null {
  const label = account?.trim() || null;
  const suffix = granted > 1 ? connectionSuffix(connectionId) : '';
  if (!suffix) return label;
  return label ? `${label} · ${suffix}` : `Account · ${suffix}`;
}
