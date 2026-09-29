import type { SettingsPageId } from './pages';
import type { SettingsTileName } from './SettingsTileIcon';

export const categories: { id: SettingsTileName; label: string; page: SettingsPageId; detail: string }[] = [
  { id: 'general', label: 'General', page: 'general', detail: 'Appearance, personality, memory, privacy' },
  { id: 'accounts', label: 'Accounts', page: 'accounts', detail: 'AI logins and integrations' },
  { id: 'notifications', label: 'Notifications', page: 'notifications', detail: 'Alerts and sounds' },
  { id: 'computer', label: 'Computer', page: 'computer', detail: 'Connection and terminal text' },
  { id: 'account', label: 'Account', page: 'account', detail: 'Profile, membership, security' },
  { id: 'help', label: 'Help', page: 'help', detail: 'Report a problem, support and guides' },
  { id: 'advanced', label: 'Advanced', page: 'advanced', detail: 'Testing and updates' },
];

const guestCategories = new Set<SettingsTileName>(['general', 'help', 'advanced']);
export const visibleSettingsCategories = (hasAccount: boolean) =>
  hasAccount ? categories : categories.filter(category => guestCategories.has(category.id));

const entries: { label: string; keywords: string; page: SettingsPageId; category: string }[] = [
  { label: 'Theme and accent', keywords: 'dark light automatic appearance color colour', page: 'general', category: 'General' },
  { label: 'Personality', keywords: 'assistant tone style', page: 'personality', category: 'General' },
  { label: 'Skills', keywords: 'teammates instructions library', page: 'skills', category: 'General' },
  { label: 'Memory', keywords: 'remember about you summary', page: 'memory', category: 'General' },
  { label: 'Privacy', keywords: 'analytics usage statistics', page: 'privacy', category: 'General' },
  { label: 'OpenAI / ChatGPT account', keywords: 'codex ai terminal login sign in', page: 'accounts', category: 'Accounts' },
  { label: 'Anthropic / Claude account', keywords: 'ai terminal login sign in', page: 'accounts', category: 'Accounts' },
  { label: 'Google / Gemini account', keywords: 'ai terminal login sign in', page: 'accounts', category: 'Accounts' },
  { label: 'Integrations', keywords: 'plugins github stripe figma connect services', page: 'accounts', category: 'Accounts' },
  { label: 'Notifications', keywords: 'alerts push sounds', page: 'notifications', category: 'Notifications' },
  { label: 'Computer connection', keywords: 'mac host pair remote cloud', page: 'computer', category: 'Computer' },
  { label: 'Terminal text size', keywords: 'font zoom bigger smaller', page: 'computer', category: 'Computer' },
  { label: 'Profile', keywords: 'name email avatar photo', page: 'profile', category: 'Account' },
  { label: 'Subscription', keywords: 'membership pro plan billing', page: 'subscription', category: 'Account' },
  { label: 'Vibyra tokens', keywords: 'credits balance wallet', page: 'vibes', category: 'Account' },
  { label: 'Security', keywords: 'password sessions devices', page: 'security', category: 'Account' },
  { label: 'Remote access', keywords: 'security trusted devices passkeys sessions revoke disable', page: 'remoteAccess', category: 'Account' },
  { label: 'Two-factor authentication', keywords: '2fa authenticator recovery code', page: 'twoFactor', category: 'Account' },
  { label: 'Delete account', keywords: 'remove close erase', page: 'delete', category: 'Account' },
  { label: 'Updates', keywords: 'version release', page: 'updates', category: 'Advanced' },
  { label: 'Sample workspace', keywords: 'testing demo', page: 'advanced', category: 'Advanced' },
  { label: 'Help and guides', keywords: 'support documentation', page: 'help', category: 'Help' },
  { label: 'Report a problem', keywords: 'bug support feedback', page: 'report', category: 'Help' },
];

const guestPages = new Set<SettingsPageId>(['general', 'privacy', 'help', 'report', 'advanced', 'updates']);
export function searchSettings(query: string, hasAccount: boolean, demo: boolean) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return entries.filter(entry => {
    if (!hasAccount && !guestPages.has(entry.page) &&
      !(demo && (entry.page === 'personality' || entry.page === 'memory'))) return false;
    return words.every(word => `${entry.label} ${entry.keywords} ${entry.category}`
      .toLowerCase().includes(word));
  }).slice(0, 8);
}
