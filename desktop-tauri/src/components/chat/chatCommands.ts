import type { CommandCatalogue } from '../../../../mobile/src/conversation/inspection';
import type { ModelChoice } from '../../../../mobile/src/conversation/inspection';
import { effortWords } from './useChatModels';

export type CommandGroup = 'chat' | 'ask' | 'look' | 'native';
export type CommandIcon = 'model' | 'effort' | 'stop' | 'new' | 'copy' | 'review' | 'init' | 'diff' | 'context' | 'status' | 'usage' | 'permissions' | 'help' | 'terminal';
export interface ChatCommand {
  name: string; aliases: string[]; description: string; group: CommandGroup; icon: CommandIcon;
  /** Shown after the name while typing: "/model ‹name›". */
  args?: string;
  /** Why it cannot run here; set only for the native-terminal group. */
  reason?: string;
}
export const GROUP_TITLES: Record<CommandGroup, string> = {
  chat: 'Chat', ask: 'Prompts', look: 'Inspect', native: 'Terminal only',
};

/** What the Mac adds on top of the Host's catalogue; each one runs here, not in the provider. */
const LOCAL: ChatCommand[] = [
  { name: 'new', aliases: ['clear'], description: 'Start a fresh chat with the same model', group: 'chat', icon: 'new' },
  { name: 'copy', aliases: [], description: 'Copy the last reply', group: 'chat', icon: 'copy' },
  { name: 'review', aliases: [], description: 'Review the changes made in this chat', group: 'ask', icon: 'review' },
  { name: 'init', aliases: [], description: 'Write an instructions file for this project', group: 'ask', icon: 'init' },
];
/** Friendly wording and placement for the Host's own commands. */
const HOST: Record<string, Pick<ChatCommand, 'group' | 'icon' | 'description'> & { args?: string; aliases?: string[] }> = {
  model: { group: 'chat', icon: 'model', description: 'Switch company or model', args: 'name' },
  effort: { group: 'chat', icon: 'effort', description: 'Set how hard it thinks', args: 'level' },
  stop: { group: 'chat', icon: 'stop', description: 'Stop the reply in progress' },
  diff: { group: 'look', icon: 'diff', description: 'Files changed in this chat', aliases: ['changes'] },
  context: { group: 'look', icon: 'context', description: 'What it has read and searched' },
  status: { group: 'look', icon: 'status', description: 'Session, account and settings' },
  usage: { group: 'look', icon: 'usage', description: 'Tokens used and account limits', aliases: ['cost'] },
  permissions: { group: 'look', icon: 'permissions', description: 'What it may run without asking' },
  help: { group: 'look', icon: 'help', description: 'Every command' },
};
const ORDER = ['model', 'effort', 'stop', 'new', 'copy', 'review', 'init', 'diff', 'context', 'status', 'usage', 'permissions', 'help'];

/** The Host's catalogue plus the Mac's own commands, in menu order; local commands win over "unsupported". */
export function chatCommands(catalogue?: CommandCatalogue): ChatCommand[] {
  const host = (catalogue?.commands ?? []).filter(command => command.available).map<ChatCommand>(command => {
    const extra = HOST[command.name];
    return { name: command.name, aliases: [...command.aliases, ...(extra?.aliases ?? [])], description: extra?.description ?? command.description,
      group: extra?.group ?? 'look', icon: extra?.icon ?? 'help', args: extra?.args };
  });
  const names = new Set([...host, ...LOCAL].flatMap(command => [command.name, ...command.aliases]));
  const native = (catalogue?.unsupported ?? []).filter(item => !names.has(item.name)).map<ChatCommand>(item => ({
    name: item.name, aliases: [], description: item.reason, group: 'native', icon: 'terminal', reason: item.reason }));
  const rank = (name: string) => { const index = ORDER.indexOf(name); return index < 0 ? ORDER.length : index; };
  return [...host, ...LOCAL.filter(command => !host.some(item => item.name === command.name))]
    .sort((a, b) => rank(a.name) - rank(b.name)).concat(native);
}

export function findCommand(commands: ChatCommand[], name: string) {
  const lower = name.toLowerCase();
  return commands.find(command => command.name === lower || command.aliases.includes(lower));
}

export interface Suggestion { key: string; text: string; title: string; detail: string; icon: CommandIcon; group: CommandGroup | 'arg'; disabled?: boolean; current?: boolean }

/**
 * What the "/" menu offers for a draft: commands while the name is typed, then
 * the argument choices for /model and /effort. Native-only commands appear only
 * once their name is typed, so the everyday list stays short.
 */
export function suggestions(draft: string, commands: ChatCommand[], models: ModelChoice[], ladder: string[], current: { model?: string; effort?: string | null }): Suggestion[] {
  const body = draft.trimStart().slice(1);
  const space = body.search(/\s/);
  if (space >= 0) {
    const command = findCommand(commands, body.slice(0, space));
    const query = body.slice(space).trim().toLowerCase();
    if (command?.name === 'model') return models.filter(model => `${model.displayName} ${model.model}`.toLowerCase().includes(query))
      .map(model => ({ key: model.model, text: `/model ${model.model}`, title: model.displayName, detail: model.model, icon: 'model', group: 'arg', current: model.model === current.model }));
    if (command?.name === 'effort') return ladder.filter(level => `${level} ${effortWords(level).label}`.toLowerCase().includes(query))
      .map(level => ({ key: level, text: `/effort ${level}`, title: effortWords(level).label, detail: effortWords(level).hint, icon: 'effort', group: 'arg', current: level === current.effort }));
    return [];
  }
  const query = body.toLowerCase();
  const score = (command: ChatCommand) => command.name.startsWith(query) || command.aliases.some(alias => alias.startsWith(query)) ? 0
    : command.name.includes(query) || command.description.toLowerCase().includes(query) ? 1 : 2;
  return commands.filter(command => score(command) < 2 && (command.group !== 'native' || query.length >= 2))
    .sort((a, b) => score(a) - score(b))
    .map(command => ({ key: command.name, text: `/${command.name}`, title: `/${command.name}`, detail: command.description,
      icon: command.icon, group: command.group, disabled: command.group === 'native' }));
}
