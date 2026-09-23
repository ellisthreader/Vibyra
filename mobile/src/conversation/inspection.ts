import type { AgentItem } from '../state/conversationTypes';
export interface ModelChoice {
  model: string;
  displayName: string;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[];
}
export interface CommandChoice {
  name: string;
  description: string;
  scope: string;
  aliases: string[];
  available: boolean;
}
export interface CommandCatalogue {
  version: number;
  commands: CommandChoice[];
  unsupported: { name: string; reason: string }[];
}
export type InspectorMode =
  'help' | 'status' | 'usage' | 'model' | 'effort' | 'permissions' | 'diff' | 'context';
export function parseCommand(text: string, catalogue: CommandCatalogue) {
  if (!text.trimStart().startsWith('/')) return null;
  const [name, ...args] = text.trim().slice(1).split(/\s+/);
  const command = catalogue.commands.find(
    (command) => command.name === name || command.aliases.includes(name),
  );
  return {
    name: command?.name ?? name,
    args: args.join(' '),
    supported: Boolean(command),
    reason:
      catalogue.unsupported.find((command) => command.name === name)?.reason ??
      'Unknown command. Choose a command or send this as text.',
  };
}
export function operationLabel(items: AgentItem[], waiting = false) {
  const request = [...items]
    .reverse()
    .find((item) => ['pending', 'responding'].includes(item.status));
  if (request)
    return request.kind === 'permission' ? 'Waiting for permission' : 'Waiting for your answer';
  const active = items.filter((item) => item.kind === 'activity' && item.status === 'running');
  if (active.length)
    return `${active.at(-1)!.title ?? 'Working'}${active.length > 1 ? ` · ${active.length} active` : ''}`;
  return waiting ? 'Waiting for your response' : 'Working';
}
export function changedFiles(items: AgentItem[], turn?: string | null) {
  return items
    .filter((item) => item.category === 'fileChange' && (!turn || item.turnId === turn))
    .flatMap((item) =>
      (item.changes ?? []).map((change) => ({
        ...change,
        item,
        operation:
          change.kind.type === 'add'
            ? 'Created'
            : change.kind.type === 'delete'
              ? 'Deleted'
              : change.kind.move_path
                ? 'Renamed'
                : 'Modified',
      })),
    );
}
export function durationLabel(ms?: number | null) {
  return ms == null ? '' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}
export interface ArtifactPage {
  id: string;
  hash: string;
  content: string;
  offset: number;
  bytes: number;
  nextOffset: number | null;
}
export async function readArtifact(
  request: (params: Record<string, unknown>) => Promise<ArtifactPage>,
  item: AgentItem,
) {
  if (!item.artifact) return item.detail ?? item.text ?? '';
  let offset = 0,
    content = '';
  for (let page = 0; page < 32; page++) {
    const result = await request({
      artifactId: item.artifact.id,
      hash: item.artifact.hash,
      offset,
    });
    content += result.content;
    if (result.nextOffset === null) return content;
    if (result.nextOffset <= offset || content.length > 262144)
      throw new Error('Invalid artifact pagination');
    offset = result.nextOffset;
  }
  throw new Error('Artifact exceeded its retained size limit');
}
