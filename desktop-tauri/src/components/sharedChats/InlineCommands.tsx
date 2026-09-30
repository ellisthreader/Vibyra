import { useEffect, useState } from 'react';
import { chatRequest } from '../../ipc/sharedChats';
import type { CommandCatalogue } from '../../../../mobile/src/conversation/inspection';

export function InlineCommands({ sessionId, draft, onChoose }: { sessionId: string; draft: string; onChoose(command: string): void }) {
  const [catalogue, setCatalogue] = useState<CommandCatalogue>(); const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void chatRequest<CommandCatalogue>('conversation.commands', { sessionId }).then(value => { if (alive) setCatalogue(value); }).catch(error => { if (alive) setError(String(error)); });
    return () => { alive = false; };
  }, [sessionId]);
  const query = draft.trimStart().slice(1).split(/\s/)[0].toLowerCase();
  const commands = catalogue?.commands.filter(command => command.available && (command.name.startsWith(query) || command.aliases.some(alias => alias.startsWith(query)))) ?? [];
  return <div className="inline-commands" aria-label="Command suggestions">
    {commands.map(command => <button type="button" key={command.name} onClick={() => onChoose(`/${command.name}`)}><strong>/{command.name}</strong><span>{command.description}</span><small>↵</small></button>)}
    {!commands.length && <p>{error || (catalogue ? catalogue.unsupported.find(command => command.name === query)?.reason ?? 'No matching command.' : 'Loading commands…')}</p>}
  </div>;
}
