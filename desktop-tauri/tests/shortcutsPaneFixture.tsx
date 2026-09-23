import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { SettingsModal } from '../src/components/settings/SettingsModal';
import { useSettingsStore } from '../src/state/settingsStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import type { Settings } from '../src/types';

/**
 * Settings > Shortcuts on sample values: the three system-wide recorders and
 * the reference list of in-app keys. Nothing is saved — every command is answered
 * here — so the page can be judged on one theme and platform at a time.

 */
const query = new URLSearchParams(location.search);
document.documentElement.dataset.platform = query.get('platform') ?? 'mac';
document.documentElement.dataset.theme = query.has('light') ? 'light' : 'dark';
mockWindows('main');

const events: unknown[] = [];
mockIPC((command, payload) => {
  events.push([command, payload]);
  if (command === 'speech_voices') {
    if (query.has('novoices')) throw 'Could not read the installed voices';
    return [{ id: 'alloy', locale: 'multilingual' }, { id: 'nova', locale: 'multilingual' }, { id: 'shimmer', locale: 'multilingual' }];
  }
  return null;
});
Object.assign(window, { shortcutEvents: events, shortcutLast: () => events.at(-1) });

useSettingsStore.setState({
  settings: {
    theme: 'dark',
    fontSize: 13,
    projects: [],
    voiceShortcut: query.get('voice') ?? 'F8',
    screenshotShortcut: query.get('screenshot') ?? 'F9',
    talkShortcut: query.get('talk') ?? 'F10',
    speechVoice: query.get('voiceName') ?? '',
  } as unknown as Settings,
  update: async (partial) => { events.push(['update', partial]); },
});
useWorkspaceStore.setState({ settingsOpen: true, settingsSection: 'shortcuts', settingsPanel: null });

createRoot(document.getElementById('root')!).render(<SettingsModal />);
