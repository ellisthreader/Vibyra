import type { VibesChat } from '../vibes/types';
import type { Project, WorkspaceModel } from './types';

/**
 * Every conversation lives in a project. The phone's own chats live in Ideas: a
 * project every account has, always first, that needs no computer and no form.
 * Open the app, type, and it goes there. A named project is a folder on a
 * computer; its chats are the ones bound to it. Both are the same object to the
 * rest of the app, so the rule stays clean: a chat always belongs to a project.
 */
export const IDEAS_PROJECT_ID = 'ideas';
// Keep the legacy id so existing local chats remain attached to their home.
export const ideasProject: Project = { id: IDEAS_PROJECT_ID, name: 'Chats', path: 'On your phone' };
export const isIdeas = (project: Pick<Project, 'id'> | string | null | undefined) =>
  (typeof project === 'string' ? project : project?.id) === IDEAS_PROJECT_ID;

/** The folders a chat could belong to: what the computer shares now, or what it
 *  was last seen sharing. A chat bound to a folder nobody lists any more still
 *  has a home — Ideas — so no history is ever lost to a forgotten project. */
export function knownProjects(
  workspace: Pick<WorkspaceModel, 'status' | 'projects' | 'remembered'>,
): Project[] {
  return workspace.status === 'connected'
    ? workspace.projects
    : (workspace.remembered?.projects ?? []);
}

/** Which project a phone chat lives in. */
export function chatProjectId(
  chat: Pick<VibesChat, 'host_id' | 'project_id'>,
  workspace: Pick<WorkspaceModel, 'status' | 'projects' | 'remembered' | 'host'>,
): string {
  if (!chat.project_id || !chat.host_id || chat.host_id !== workspace.host?.id)
    return IDEAS_PROJECT_ID;
  return knownProjects(workspace).some((project) => project.id === chat.project_id)
    ? chat.project_id
    : IDEAS_PROJECT_ID;
}

/** The chats in one project, in the order the store keeps them (newest first). */
export const chatsInProject = (
  chats: VibesChat[],
  projectId: string,
  workspace: Pick<WorkspaceModel, 'status' | 'projects' | 'remembered' | 'host'>,
) => chats.filter((chat) => chatProjectId(chat, workspace) === projectId);

/** How many chats a project holds, in words, for a row's second line. */
export function chatWords(count: number) {
  return count === 0 ? 'No chats yet' : `${count} ${count === 1 ? 'chat' : 'chats'}`;
}
