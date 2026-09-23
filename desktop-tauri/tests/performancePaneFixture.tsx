import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { SettingsModal } from '../src/components/settings/SettingsModal';
import { applyPerformanceMode, normalizePerformanceMode } from '../src/lib/performanceMode';
import { useAccountStore } from '../src/state/accountStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useTerminalStore } from '../src/state/terminalStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import type { Settings } from '../src/types';

/**
 * Settings > General on sample data, opened at the Performance group. The real
 * store and the real `update` path run; only the disk is answered here, so a
 * level change travels exactly as far as it does in the app — through
 * `applyDocument` onto `<html>`, where the stylesheet picks it up.
 */
const query = new URLSearchParams(location.search);
document.documentElement.dataset.platform = 'mac';
document.documentElement.dataset.theme = query.has('light') ? 'light' : 'dark';
mockWindows('main');

const saved: Settings[] = [];
const calls: string[] = [];
const settings = {
  theme: query.has('light') ? 'light' : 'dark',
  agentView: 'terminal',
  fontSize: 13,
  fontFamily: 'JetBrains Mono',
  scrollbackLines: 5_000,
  rendererMode: 'auto',
  enabledAgentIds: [],
  performanceMode: normalizePerformanceMode(query.get('level')),
  persistTerminalScrollback: true,
  sendProjectContext: true,
  screenshotHideWindow: false,
  voiceShortcut: 'F8',
  screenshotShortcut: 'F9',
  talkShortcut: 'F10',
  aiDailyCallCap: 250,
  aiHourlyCallCap: 60,
  aiDailySpendCapUsd: 2,
  aiMonthlySpendCapUsd: 20,
  notifications: {},
  customAgents: [],
  projects: [],
  activeProjectId: null,
} as unknown as Settings;

mockIPC((command, payload) => {
  calls.push(command);
  if (command === 'get_settings') return useSettingsStore.getState().settings ?? settings;
  if (command === 'save_settings') {
    saved.push((payload as { settings: Settings }).settings);
    return null;
  }
  // Settings > Advanced asks the platform whether Graphics is even offerable.
  // macOS says no, which is exactly the state this page has to be judged in.
  if (command === 'renderer_policy') {
    return { mode: 'auto', configurable: false, softwareCompositing: false, nvidiaSession: false, environmentOverride: false };
  }
  // Privacy: the saved-workspace row deletes a file, so the fixture answers
  // rather than writes, and the test reads the call back off `calls`.
  if (command === 'clear_terminal_session') return null;
  if (command === 'project_brief') return { text: 'vibyra · main · 2 changed files' };
  return null;
});

// What a test reads back: every level the app wrote to disk, and the attribute
// the document is actually carrying right now.
Object.assign(window, {
  savedLevels: () => saved.map((entry) => entry.performanceMode),
  savedRendererModes: () => saved.map((entry) => entry.rendererMode),
  documentLevel: () => document.documentElement.dataset.performance ?? null,
  ipcCalls: () => calls.slice(),
});

useSettingsStore.setState({ settings });
applyPerformanceMode(normalizePerformanceMode(settings.performanceMode));
useAccountStore.setState({
  snapshot: { status: 'signedOut', profile: null, error: null, pendingProvider: null, secureStorage: true },
  busy: false,
});
useTerminalStore.setState({ panes: [] as never });
useWorkspaceStore.setState({
  settingsOpen: true,
  settingsSection: query.get('section') ?? 'general',
  settingsPanel: null,
});

createRoot(document.getElementById('root')!).render(<SettingsModal />);
