import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { SettingsModal } from '../src/components/settings/SettingsModal';
import { useAccountStore } from '../src/state/accountStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useTerminalStore } from '../src/state/terminalStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import type { Settings } from '../src/types';

/**
 * Settings > Accounts on sample data. The real stores and the real `update`
 * path run; only the native side is answered here, so switching an agent on
 * travels exactly as far as it does in the app.
 *
 * `?installed=` picks which optional CLIs this Mac is pretending to have, so a
 * test can drive the "nothing installed yet" case as well as the usual one.
 */
const query = new URLSearchParams(location.search);
document.documentElement.dataset.platform = 'mac';
document.documentElement.dataset.theme = query.has('light') ? 'light' : 'dark';
mockWindows('main');

const installed = new Set((query.get('installed') ?? 'qwen').split(',').filter(Boolean));
const saved: Settings[] = [];

// Mirrors agents/catalog.rs and agents/install.rs. A drift here shows up as
// a row the real app would never draw, so the ids are the contract.
const NPM = {
  codex: '@openai/codex', claude: '@anthropic-ai/claude-code', gemini: '@google/gemini-cli',
  qwen: '@qwen-code/qwen-code', opencode: 'opencode-ai', copilot: '@github/copilot',
  crush: '@charmland/crush', amp: '@sourcegraph/amp', continue: '@continuedev/cli',
};
const MANUAL = { aider: ['aider-chat', 'python3 -m pip install aider-chat'] };
const AGENTS = [
  { id: 'shell', name: 'Terminal', program: 'zsh', accent: '#7dd3fc', description: 'Plain system shell' },
  { id: 'claude', name: 'Claude Code', program: 'claude', accent: '#d97757', description: 'Anthropic Claude Code CLI' },
  { id: 'codex', name: 'Codex', program: 'codex', accent: '#a5b4fc', description: 'OpenAI Codex CLI' },
  { id: 'gemini', name: 'Gemini', program: 'gemini', accent: '#60a5fa', description: 'Google Gemini CLI' },
  { id: 'aider', name: 'Aider', program: 'aider', accent: '#4ade80', description: 'Aider pair-programming CLI' },
  { id: 'opencode', name: 'OpenCode', program: 'opencode', accent: '#f472b6', description: 'OpenCode agent CLI' },
  { id: 'qwen', name: 'Qwen Code', program: 'qwen', accent: '#c084fc', description: 'Qwen Code CLI' },
  { id: 'copilot', name: 'GitHub Copilot', program: 'copilot', accent: '#8b949e', description: 'GitHub Copilot CLI' },
  { id: 'amp', name: 'Amp', program: 'amp', accent: '#f59e0b', description: 'Sourcegraph Amp CLI' },
  { id: 'crush', name: 'Crush', program: 'crush', accent: '#22d3ee', description: 'Charm Crush CLI' },
  { id: 'continue', name: 'Continue', program: 'cn', accent: '#94a3b8', description: 'Continue CLI' },
];

function hint(id) {
  if (NPM[id]) return { manager: 'npm', package: NPM[id], command: `npm install --global ${NPM[id]}` };
  if (MANUAL[id]) return { manager: 'manual', package: MANUAL[id][0], command: MANUAL[id][1] };
  return null;
}

// An install the test drives: `?install=ok` lands, `?install=fail` reports.
const installs = {};
const present = new Set();

const account = (label: string) => ({
  accountId: 'default', status: 'connected', accountLabel: label, detail: 'Signed in',
  signInPageAvailable: false, prompt: '', removable: false,
});
const PROVIDERS = [
  { id: 'codex', company: 'OpenAI', product: 'Codex', runtimeId: 'codex', installed: true, package: '@openai/codex', canAddAccount: true, accounts: [account('ellis@example.test')] },
  { id: 'claude', company: 'Anthropic', product: 'Claude Code', runtimeId: 'claude', installed: true, package: '@anthropic-ai/claude-code', canAddAccount: true, accounts: [account('ellis@example.test')] },
  { id: 'gemini', company: 'Google', product: 'Gemini', runtimeId: 'gemini', installed: false, package: '@google/gemini-cli', canAddAccount: true, accounts: [] },
];

const settings = {
  theme: query.has('light') ? 'light' : 'dark',
  agentView: 'terminal', fontSize: 13, fontFamily: 'JetBrains Mono', scrollbackLines: 5_000,
  rendererMode: 'auto', enabledAgentIds: (query.get('on') ?? '').split(',').filter(Boolean),
  performanceMode: 'balanced', persistTerminalScrollback: true, sendProjectContext: true,
  screenshotHideWindow: false, voiceShortcut: 'F8', screenshotShortcut: 'F9', talkShortcut: 'F10',
  aiDailyCallCap: 250, aiHourlyCallCap: 60, aiDailySpendCapUsd: 2, aiMonthlySpendCapUsd: 20,
  notifications: {}, customAgents: [], projects: [], activeProjectId: null,
} as unknown as Settings;

mockIPC((command, payload) => {
  if (command === 'get_settings') return useSettingsStore.getState().settings ?? settings;
  if (command === 'save_settings') {
    saved.push((payload as { settings: Settings }).settings);
    return null;
  }
  if (command === 'list_agents' || command === 'refresh_agents') {
    return AGENTS.map((spec) => ({
      ...spec, args: [], env: [], custom: false,
      installed:
        spec.id === 'shell' ||
        ['claude', 'codex'].includes(spec.id) ||
        installed.has(spec.id) ||
        present.has(spec.id),
      install: hint(spec.id),
    }));
  }
  if (command === 'install_agent_cli') {
    const agent = (payload as { agent: string }).agent;
    if (query.get('install') === 'refuse') throw 'Installing this needs npm, which this machine does not have.';
    installs[agent] = { running: true, error: null };
    setTimeout(() => {
      if (query.get('install') === 'fail') {
        installs[agent] = { running: false, error: 'npm error 404 Not Found' };
      } else {
        present.add(agent);
        installs[agent] = { running: false, error: null };
      }
    }, 400);
    return null;
  }
  if (command === 'agent_installs') return installs;
  if (command === 'clear_agent_install') {
    delete installs[(payload as { agent: string }).agent];
    return null;
  }
  if (command === 'provider_accounts') return PROVIDERS;
  if (command === 'memory_sources') return [];
  if (command === 'chat_connectors') return [];
  return null;
});

Object.assign(window, {
  savedEnabled: () => saved.map((entry) => entry.enabledAgentIds.join(',')),
  currentEnabled: () => useSettingsStore.getState().settings?.enabledAgentIds ?? [],
});

useSettingsStore.setState({ settings });
useAccountStore.setState({
  snapshot: { status: 'signedIn', profile: { name: 'Ellis', email: 'ellis@example.test', plan: 'free' }, error: null, pendingProvider: null, secureStorage: true },
  busy: false,
} as never);
useTerminalStore.setState({ panes: [] as never });
useWorkspaceStore.setState({ settingsOpen: true, settingsSection: 'ai', settingsPanel: null });

createRoot(document.getElementById('root')!).render(<SettingsModal />);
