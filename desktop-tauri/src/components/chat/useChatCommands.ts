import { useEffect, useMemo, useState } from 'react';
import { chatRequest, type AgentItem, type ConversationSnapshot, type SharedSession } from '../../ipc/sharedChats';
import type { CommandCatalogue, InspectorMode } from '../../../../mobile/src/conversation/inspection';
import { launchConfigured } from '../../lib/configuredLaunch';
import { useAgentStore } from '../../state/agentStore';
import { chatCommands, findCommand, suggestions, type Suggestion } from './chatCommands';
import type { ChatModels } from './useChatModels';

const REVIEW = 'Review the changes you made in this conversation. List bugs, risks and anything missing, most important first, with file and line. Do not change any files.';
const INIT = (file: string) => `Create ${file} at the project root for future AI agents: what this project is, how it is laid out, how to install, run and test it, and the conventions to follow. Read the code first; keep it short and accurate.`;
const INSTRUCTIONS: Record<string, string> = { claude: 'CLAUDE.md', gemini: 'GEMINI.md' };

/**
 * Everything "/" does in the Mac chat: the menu's suggestions and keyboard
 * position, and running a command. The Host's catalogue is fetched once per
 * session, not on every send. Read-only commands work while the agent replies.
 */
export function useChatCommands({ session, snapshot, items, draft, models, working, ready, send, run, openPicker, openPanel }: {
  session: SharedSession; snapshot: ConversationSnapshot | null; items: AgentItem[]; draft: string; models: ChatModels;
  working: boolean; ready: boolean;
  send(text: string): Promise<boolean>; run(work: () => Promise<unknown>): Promise<boolean>;
  openPicker(panel: 'model' | 'effort'): void; openPanel(mode: InspectorMode): void;
}) {
  const [catalogue, setCatalogue] = useState<CommandCatalogue>();
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => {
    let alive = true;
    void chatRequest<CommandCatalogue>('conversation.commands', { sessionId: session.id })
      .then(value => { if (alive) setCatalogue(value); }).catch(cause => { if (alive) setLoadError(String(cause)); });
    return () => { alive = false; };
  }, [session.id]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 2400); return () => clearTimeout(timer); }, [notice]);
  const commands = useMemo(() => chatCommands(catalogue), [catalogue]);
  const open = draft.trimStart().startsWith('/');
  const list = useMemo(() => open ? suggestions(draft, commands, models.models, models.ladder,
    { model: snapshot?.settings?.model, effort: models.effort }).filter(item => working || item.key !== 'stop') : [], [open, working, draft, commands, models.models, models.ladder, models.effort, snapshot?.settings?.model]);
  useEffect(() => setActive(0), [draft.trimStart().split(/\s/)[0]]);
  const fail = (message: string) => { setError(message); return false; };

  /** Runs "/name args"; resolves true when the draft should clear. */
  const execute = async (text: string): Promise<boolean> => {
    const [raw, ...rest] = text.trim().slice(1).split(/\s+/);
    const args = rest.join(' ').trim();
    const command = findCommand(commands, raw ?? '');
    setError('');
    if (!command) return fail(catalogue ? `There is no /${raw} command here.` : 'Commands are still loading.');
    if (command.reason) return fail(command.reason);
    switch (command.name) {
      case 'model': {
        if (!args) { openPicker('model'); return true; }
        const wanted = args.toLowerCase();
        const model = models.models.find(item => item.model.toLowerCase() === wanted || item.displayName.toLowerCase() === wanted);
        if (!model) return fail(`No model called “${args}” on this account. Type /model to see them.`);
        return await models.chooseModel(model) ? (setNotice(`Next message uses ${model.displayName}`), true) : false;
      }
      case 'effort': {
        if (!args) { openPicker('effort'); return true; }
        const level = models.ladder.find(item => item === args.toLowerCase());
        if (!level) return fail(models.ladder.length ? `${models.name} offers ${models.ladder.join(', ')}.` : `${models.name} has fixed thinking.`);
        return models.chooseEffort(level);
      }
      case 'stop':
        if (!working) return fail('Nothing is running right now.');
        return run(() => chatRequest('turn.interrupt', { sessionId: session.id, turnId: snapshot?.turnId }));
      case 'new': {
        const agent = useAgentStore.getState().agents.find(item => item.id === models.agent.id);
        if (!agent) return fail(`${models.agent.name} is not available on this Mac.`);
        const opened = await launchConfigured(agent, session.projectId, { model: snapshot?.settings?.model ?? null,
          reasoningEffort: (models.effort ?? undefined) as never, view: 'chat' });
        return opened.length ? (setNotice('Started a fresh chat'), true) : fail('A new chat could not start. See the notice above.');
      }
      case 'copy': {
        const reply = [...items].reverse().find(item => item.kind === 'message' && item.role === 'assistant' && item.text?.trim());
        if (!reply?.text) return fail('There is no reply to copy yet.');
        await navigator.clipboard.writeText(reply.text);
        setNotice('Copied the last reply'); return true;
      }
      case 'review': case 'init':
        if (working) return fail('Wait for the current reply, or /stop it first.');
        if (!ready) return fail('This chat is not running. Send a message to resume it first.');
        return send(command.name === 'review' ? REVIEW : INIT(INSTRUCTIONS[models.agent.id] ?? 'AGENTS.md'));
      case 'diff': case 'context': case 'status': case 'usage': case 'permissions': case 'help':
        if (args) return fail(`/${command.name} does not take anything after it.`);
        openPanel(command.name); return true;
      default: return fail(`/${command.name} is not available in this chat.`);
    }
  };
  /** The text a chosen row runs; a native-only row explains itself instead. */
  const choose = (item?: Suggestion) => {
    if (item?.disabled) { setError(item.detail); return null; }
    return item?.text ?? null;
  };
  const move = (step: number) => setActive(index => list.length ? (index + step + list.length) % list.length : 0);
  return { list, active, setActive, move, choose, execute, error, setError, notice, loading: !catalogue && !loadError, loadError, open };
}
