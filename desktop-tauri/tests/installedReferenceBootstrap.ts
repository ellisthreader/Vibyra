import { mockIPC } from '@tauri-apps/api/mocks';
import { parityIpc } from './desktopParityIpc';
import { parityScreen, paritySnapshots, seedParityFixture } from './desktopParityState';
import { reportParityLayout } from './desktopParityMetrics';

// This harness loads the untouched assets extracted from the installed app.
// Only data and native services are replaced, using the same sample fixture.
seedParityFixture();
for (const email of ['guest', 'fixture@example.test']) {
  localStorage.setItem('product-mode.' + encodeURIComponent(email), parityScreen === 'agents' ? 'agent' : 'work');
}
const snapshots = paritySnapshots();
const profile = snapshots.find(s => 'snapshot' in s)!.snapshot;
const settings = snapshots.find(s => 'settings' in s)!.settings;
const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  return url.origin === location.origin ? originalFetch(input, init) : Promise.reject(new Error('Reference fixture has no external services.'));
};
mockIPC(async (command, args) => {
  if (['account_restore', 'account_profile_refresh'].includes(command)) return profile;
  if (command === 'get_settings') return settings;
  if (command === 'home_dir') return '/fixture';
  if (command === 'get_app_version' || command === 'plugin:app|version') return '0.7.8';
  return parityIpc(command, args);
});

type Store = { getState(): Record<string, unknown>; setState(value: unknown): void };
const manifest = await originalFetch('/reference-manifest').then(r => r.json()) as { entry: string; stores: string[] };
const stores: Store[] = [];
for (const file of manifest.stores) {
  const module = await import(/* @vite-ignore */ file);
  for (const value of Object.values(module)) {
    if (value && typeof (value as Store).getState === 'function' && !stores.includes(value as Store)) stores.push(value as Store);
  }
}
function seedReferenceStores() {
  const matched: string[] = [];
  for (const store of stores) {
    const current = store.getState();
    const source = snapshots.find(snapshot => {
      const discriminator = ['snapshot', 'settings', 'activeId', 'panes', 'companionOpen', 'threads', 'sessions', 'mode', 'status']
        .find(key => key in snapshot);
      return discriminator && discriminator in current;
    });
    if (source) {
      matched.push(Object.keys(current).slice(0, 4).join(','));
      store.setState(source);
    }
  }
  void originalFetch('/evidence', { method: 'POST', body: JSON.stringify({ referenceSeed: matched,
    stores: stores.map(store => Object.fromEntries(Object.entries(store.getState()).filter(([key]) => ['view', 'activeId', 'snapshot', 'settings', 'panes'].includes(key)))) }) });
}
seedReferenceStores();
await import(/* @vite-ignore */ manifest.entry);
// Startup runs real restoration against the mock services above. Seed layout
// after that effect settles so both views show exactly the same sample panes.
window.setTimeout(() => {
  seedReferenceStores();
  void reportParityLayout();
}, 600);
