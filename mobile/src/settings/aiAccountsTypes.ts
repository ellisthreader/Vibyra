/** Safe status sent by a paired Mac. Provider credentials never cross the phone link. */
export interface AiAccount {
  accountId: string;
  status: 'connected' | 'connecting' | 'installing' | 'sign-in-required' | 'not-installed' | 'error';
  accountLabel: string;
  detail: string;
  signInPageAvailable: boolean;
  deviceCode?: string;
  prompt: string;
  removable: boolean;
}
export interface AiProvider {
  id: 'codex' | 'claude' | 'gemini';
  company: string;
  product: string;
  runtimeId: string;
  installed: boolean;
  package: string;
  accounts: AiAccount[];
  canAddAccount: boolean;
}
export interface AiAccountsSnapshot {
  providers: AiProvider[];
  defaults: Record<string, string>;
}
export type AiAccountsMethod = 'list' | 'connect' | 'add' | 'install' | 'cancel' |
  'disconnect' | 'remove' | 'submit' | 'signInUrl' | 'openOnMac' | 'setDefault';
