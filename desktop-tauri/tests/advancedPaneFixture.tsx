import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { SettingsModal } from '../src/components/settings/SettingsModal';
import { useSettingsStore } from '../src/state/settingsStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import type { Settings } from '../src/types';

/**
 * Settings > Advanced on sample values: the order of the groups, and the voice
 * controls that used to be filed under a keyboard shortcut. Nothing is saved —
 * every command is answered here — so the page can be judged one theme at a
 * time, and a Test press can be seen arriving at `speech_start` with the
 * voice, rate and style the page is set to.
 */
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.has('light') ? 'light' : 'dark';
mockWindows('main');

const events: unknown[] = [];
mockIPC((command, payload) => {
  events.push([command, payload]);
  if (command === 'speech_voices') {
    return [{ id: 'alloy', locale: 'multilingual' }, { id: 'nova', locale: 'multilingual' }, { id: 'shimmer', locale: 'multilingual' }];
  }
  if (command === 'ai_service_status') {
    return {
      keyConfigured: true, keyFromEnvironment: false, keyHint: 'sk-…wxyz',
      secureStorageAvailable: true, recorderAvailable: true, keyPageUrl: 'https://example.invalid',
      limits: { dailyCalls: 250, hourlyCalls: 60, dailySpendUsd: 2, monthlySpendUsd: 20 },
      usage: {
        day: '2026-09-22', month: '2026-09', callsToday: 4, chatCallsToday: 3, voiceCallsToday: 1,
        inputTokensToday: 900, outputTokensToday: 300, voiceSecondsToday: 12,
        spendTodayUsd: 0.12, callsThisMonth: 40, spendMonthUsd: 1.4, callsLastMinute: 0, callsLastHour: 2,
      },
      pricing: { chatModel: 'gpt-5-nano', voiceModel: 'whisper-1', chatInputUsdPerMtok: 0.05, chatOutputUsdPerMtok: 0.4, voiceUsdPerMinute: 0.006 },
    };
  }
  if (command === 'renderer_policy') return { configurable: false, mode: 'auto', active: 'accelerated' };
  return null;
});
Object.assign(window, { advancedEvents: events, advancedLast: () => events.at(-1) });

useSettingsStore.setState({
  settings: {
    theme: 'dark',
    fontSize: 13,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    scrollbackLines: 5000,
    projects: [],
    customAgents: [],
    enabledAgentIds: [],
    workspaceRoot: null,
    screenshotDir: null,
    screenshotHideWindow: false,
    openaiKeyConfigured: true,
    talkShortcut: 'F10',
    voiceShortcut: 'F8',
    screenshotShortcut: 'F9',
    speechVoice: query.get('voiceName') ?? 'nova',
    speechRate: Number(query.get('rate') ?? '1'),
    speechStyle: query.get('style') ?? '',
    voiceLanguage: query.get('language') ?? '',
    talkPauseMs: Number(query.get('pause') ?? '1100'),
  } as unknown as Settings,
  update: async (partial) => {
    events.push(['update', partial]);
    useSettingsStore.setState((state) => ({ settings: { ...state.settings!, ...partial } }));
  },
  commit: (partial) => {
    events.push(['commit', partial]);
    useSettingsStore.setState((state) => ({ settings: { ...state.settings!, ...partial } }));
  },
});
useWorkspaceStore.setState({ settingsOpen: true, settingsSection: 'advanced', settingsPanel: null });

createRoot(document.getElementById('root')!).render(<SettingsModal />);
