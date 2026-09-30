import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { SettingsModal } from '../src/components/settings/SettingsModal';
import { DEFAULT_NOTIFICATIONS } from '../src/lib/notificationPrefs';
import { useSettingsStore } from '../src/state/settingsStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import type { NotificationPrefs } from '../src/notificationTypes';
import type { Settings } from '../src/types';

/**
 * Settings > Notifications on sample values. Nothing is saved — every command
 * is answered here — so the page can be judged one theme, one permission state
 * and one preference set at a time.
 *
 * Query: `light`, `permission=granted|denied|unknown`, `off`, `silent`,
 * `volume=0..1`, `osOff`.
 */
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.has('light') ? 'light' : 'dark';
mockWindows('main');

const permission = query.get('permission') ?? 'granted';
const events: unknown[] = [];
mockIPC((command, payload) => {
  events.push([command, payload]);
  if (command === 'plugin:notification|is_permission_granted') {
    if (permission === 'granted') return true;
    if (permission === 'denied') throw new Error('denied');
    return false;
  }
  if (command === 'plugin:notification|request_permission') {
    return permission === 'granted' ? 'granted' : 'denied';
  }
  return null;
});
Object.assign(window, {
  notifEvents: events,
  notifLast: () => events.at(-1),
});

const notifications: NotificationPrefs = {
  ...DEFAULT_NOTIFICATIONS,
  enabled: !query.has('off'),
  soundEnabled: !query.has('silent'),
  volume: Number(query.get('volume') ?? DEFAULT_NOTIFICATIONS.volume),
  osEnabled: !query.has('osOff'),
};

useSettingsStore.setState({
  settings: { theme: 'dark', fontSize: 13, projects: [], notifications } as unknown as Settings,
  update: async (partial) => {
    events.push(['update', partial]);
    const next = (partial as { notifications?: NotificationPrefs }).notifications;
    if (!next) return;
    const store = useSettingsStore.getState();
    useSettingsStore.setState({ settings: { ...store.settings, notifications: next } as Settings });
  },
});
useWorkspaceStore.setState({ settingsOpen: true, settingsSection: 'notifications', settingsPanel: null });

createRoot(document.getElementById('root')!).render(<SettingsModal />);
