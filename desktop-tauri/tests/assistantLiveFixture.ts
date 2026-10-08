// The Vibyra assistant against a real model. The chat store, the tool loop,
// the prompt and every tool run exactly as they do in the app; only native
// IPC is mocked, and `ai_chat` is forwarded to the harness in
// `mobile/scripts/verify-assistant-live.mjs`, which sends it to OpenAI with the
// same body `ai_stream.rs` builds. Driven through `window.fixture`.
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { useChatStore } from '../src/state/chatStore';
import { useConversationTerminals } from '../src/state/conversationTerminalStore';
import { useProjectStore } from '../src/state/projectStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useTerminalStore } from '../src/state/terminalStore';
import { useWorkspaceStore } from '../src/state/workspaceStore';
import { SCREENS, CHAT_ITEMS, seedPanes, seedSessions } from './assistantLiveSeed';

mockWindows('main');
const log: { command: string; args: any }[] = [];
/** Every tool call the model made, raw, for reading a failure. */
const calls: string[] = [];
const sessions = seedSessions();
let nextPane = 20;

mockIPC(async (command, raw) => {
  const args = (raw ?? {}) as Record<string, any>;
  log.push({ command, args: command === 'ai_chat' ? { tools: args.tools?.length } : args });
  switch (command) {
    case 'ai_chat': {
      const response = await fetch('/ai', { method: 'POST', body: JSON.stringify({ messages: args.messages, tools: args.tools }) });
      const outcome = await response.json();
      if (outcome.error) throw outcome.error;
      calls.push(...(outcome.toolCalls ?? []).map((call: any) => `${call.name} ${call.arguments}`));
      if (outcome.text) args.onEvent.onmessage({ text: outcome.text });
      return outcome;
    }
    case 'list_agents': return [
      { id: 'codex', name: 'Codex', program: 'codex', args: [], env: [], accent: '#a5b4fc', description: 'OpenAI Codex CLI', custom: false, installed: true },
      { id: 'claude', name: 'Claude Code', program: 'claude', args: [], env: [], accent: '#d97757', description: 'Anthropic Claude Code CLI', custom: false, installed: true },
      { id: 'shell', name: 'Terminal', program: 'zsh', args: [], env: [], accent: '#94a3b8', description: 'Plain shell', custom: false, installed: true },
      { id: 'gemini', name: 'Gemini CLI', program: 'gemini', args: [], env: [], accent: '#60a5fa', description: 'Google Gemini CLI', custom: false, installed: false },
    ];
    case 'create_terminal': {
      nextPane += 1;
      return { id: nextPane, title: args.request.agentId, agentId: args.request.agentId, cwd: args.request.cwd };
    }
    case 'terminal_snapshot': return SCREENS[args.id] ?? '';
    case 'shared_chat_list': return sessions;
    case 'shared_chat_create': {
      const session = { id: crypto.randomUUID(), projectId: args.projectId, title: args.title, status: 'running', accountId: 'default', kind: args.options?.provider ?? 'codex' };
      sessions.push(session);
      return session;
    }
    case 'shared_chat_request': {
      const { method, params } = args;
      if (method === 'session.stop') {
        const session = sessions.find((entry) => entry.id === params.sessionId);
        if (session) session.status = 'exited';
        return {};
      }
      if (method === 'turn.submit') return { status: 'accepted' };
      if (method === 'turn.submissionStatus') return { status: 'notFound' };
      if (method === 'conversation.snapshot' || method === 'conversation.status') {
        const session = sessions.find((entry) => entry.id === params.sessionId);
        return { sessionId: params.sessionId, projectId: session?.projectId, generation: 'g', cursor: 1, processState: session?.status === 'running' ? 'running' : 'exited',
          turnState: 'running', items: CHAT_ITEMS[params.sessionId] ?? [], hasMore: false, workingDirectory: '/Users/ellis/Desktop/PortfolioWebsite',
          settings: { provider: session?.kind ?? 'codex', model: 'openai/gpt-6-astra', effort: 'medium', approvalPolicy: null, revision: 1, appliesTo: 'next' } };
      }
      return {};
    }
    case 'save_settings': return args.settings;
    case 'project_brief': return { text: 'Project: PortfolioWebsite\nA personal portfolio site built with Next.js 15 and Tailwind.\nScripts: dev, build, test, lint.\nBranch: main.', shape: 'repository', codebase: true, chars: 120, truncated: [] };
    case 'home_dir': return '/Users/ellis';
    default: return null;
  }
});

useSettingsStore.setState({ settings: {
  projects: [
    { id: 'portfolio', name: 'PortfolioWebsite', root: '/Users/ellis/Desktop/PortfolioWebsite', color: '#6366f1' },
    { id: 'hke', name: 'HKE', root: '/Users/ellis/Desktop/HKE', color: '#f97316' },
    { id: 'vibyra', name: 'Vibyra', root: '/Users/ellis/Desktop/Vibyra', color: '#22d3ee' },
  ],
  fontSize: 13, fontFamily: 'monospace', theme: 'dark', openaiKeyConfigured: true, sendProjectContext: true,
} as any });
useProjectStore.setState({ activeId: 'portfolio', view: 'project', homeDir: '/Users/ellis' });
useWorkspaceStore.setState({ root: '/Users/ellis/Desktop/PortfolioWebsite', companionOpen: true, companionTab: 'chat', companionSize: 'compact' });
useTerminalStore.setState({ panes: seedPanes(), sessionReady: true, activity: { 1: 'working', 2: 'idle', 4: 'attention' } });
useConversationTerminals.setState({ sessions: [...sessions], loaded: true, open: sessions.map((entry) => entry.id), layoutReady: true });

/** Sends one message the way the composer does — to the open project's
 * thread — and resolves once the reply, and any actions in it, are settled. */
async function ask(text: string) {
  const projectId = useProjectStore.getState().activeId ?? 'portfolio';
  const before = (useChatStore.getState().threads[projectId] ?? []).length;
  await useChatStore.getState().send(projectId, text);
  const turns = (useChatStore.getState().threads[projectId] ?? []).slice(before);
  return turns.map((turn) => ({ role: turn.role, content: turn.content, status: turn.status, error: turn.error, tool: turn.tool }));
}

function state() {
  const terminals = useTerminalStore.getState();
  const chats = useConversationTerminals.getState();
  const workspace = useWorkspaceStore.getState();
  const project = useProjectStore.getState();
  return {
    panes: terminals.panes.map(({ id, agentId, projectId, status, model, permissionMode, reasoningEffort, customTitle, visibility }) =>
      ({ id, agentId, projectId, status, model, permissionMode, reasoningEffort, customTitle, visibility })),
    zoomedId: terminals.zoomedId, focusedId: terminals.focusedId,
    chats: { sessions: sessions.map((entry) => ({ ...entry })), open: chats.open, zoomed: chats.zoomed, focused: chats.focused, dismissed: chats.dismissed },
    activeId: project.activeId, view: project.view,
    projects: (useSettingsStore.getState().settings?.projects ?? []).map(({ id, name, root }) => ({ id, name, root })),
    workspace: { settingsOpen: workspace.settingsOpen, settingsSection: workspace.settingsSection, companionOpen: workspace.companionOpen,
      companionTab: workspace.companionTab, companionSize: workspace.companionSize, historyOpen: workspace.historyOpen,
      paletteOpen: workspace.paletteOpen, agentPickerOpen: workspace.agentPickerOpen, projectMode: workspace.projectMode },
    log: log.filter((entry) => entry.command !== 'ai_chat'),
    calls,
  };
}

Object.assign(window, { fixture: { ask, state, ready: true } });
