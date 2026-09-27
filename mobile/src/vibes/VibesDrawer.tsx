import { chatsInProject, isIdeas } from '../ui/ideas';
import { RailNote, RailRow } from '../ui/RailRow';
import { TreeRow } from '../ui/TreeRow';
import type { WorkspaceModel } from '../ui/types';
import { useVibes } from './VibesProvider';

// The phone's chats, as rows in a project's face of the rail: the ones bound to
// that folder, or in Ideas everything that is not. With no project named — the
// home face's search — every chat is offered, since a chat remembered by title is
// worth finding wherever it lives. Starting a new chat is the pinned action in
// the corner, so this list is only ever titles.
export function VibesDrawer({
  onOpen,
  compact = false,
  query = '',
  projectId,
  workspace,
}: {
  onOpen(): void;
  compact?: boolean;
  query?: string;
  projectId?: string;
  workspace: Pick<WorkspaceModel, 'status' | 'projects' | 'remembered' | 'host'>;
}) {
  const { store, chats, selected } = useVibes();
  const select = (id: string) => {
    void store.select(id).catch((e) => store.error(e));
    onOpen();
  };
  const inProject = projectId ? chatsInProject(chats, projectId, workspace) : chats;
  const matches = inProject.filter((chat) => chat.title.toLowerCase().includes(query));
  if (!matches.length && compact) return null;
  if (!matches.length) {
    return (
      <RailNote>
        {query
          ? `No chats match “${query}”.`
          : projectId && !isIdeas(projectId)
            ? 'No chats in this project yet.'
            : 'Your chats appear here.'}
      </RailNote>
    );
  }
  if (compact)
    return (
      <>
        {matches.map((chat) => (
          <TreeRow
            key={chat.id}
            icon="chatbubble-outline"
            label={chat.title}
            accessibilityLabel={'Open AI chat ' + chat.title}
            selected={chat.id === selected}
            onPress={() => select(chat.id)}
          />
        ))}
      </>
    );
  return (
    <>
      {matches.slice(0, 20).map((chat) => (
        <RailRow
          key={chat.id}
          icon="chatbubble-outline"
          label={chat.title}
          selected={chat.id === selected}
          accessibilityLabel={'Open AI chat ' + chat.title}
          onPress={() => select(chat.id)}
        />
      ))}
    </>
  );
}
