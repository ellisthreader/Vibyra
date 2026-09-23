import { VibesError } from '../vibes/api';
import { identified, requiredList, requiredObject } from '../transport/responseShape';
import { apiUrl, requestJson } from '../transport/requestJson';
import type { AgentsApi, AgentSkill, Teammate } from './types';
import type { VibesChat } from '../vibes/types';

export function createAgentsApi(
  baseUrl: string,
  token: () => string | null,
  fetcher: typeof fetch = fetch,
): AgentsApi {
  const call = async (path: string, body?: unknown, prefix = 'agents/v1') => {
    const identity = token();
    if (!identity) throw new VibesError('Sign in to create your teammates.', 401);
    try {
      const { response, data } = await requestJson(
        fetcher,
        apiUrl(baseUrl, `${prefix}/${path}`),
        {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            Authorization: `Bearer ${identity}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        25000,
      );
      if (identity !== token())
        throw new VibesError('Your account changed. Refresh to continue.', 401);
      if (!response.ok)
        throw new VibesError(
          data.error ??
            (response.status === 404 || response.status === 405
              ? 'Teammates are not available on this server yet.'
              : data.message) ??
            'Teammates could not be loaded.',
          response.status,
        );
      return data;
    } catch (error) {
      if (error instanceof VibesError) throw error;
      throw new VibesError('Connection interrupted. Refresh to check your request.', 0);
    }
  };
  return {
    models: async () =>
      requiredList(
        (await call('models', undefined, 'vibes')).models,
        'Teammate models',
        identified,
      ),
    skills: async () =>
      requiredList<AgentSkill>((await call('skills')).skills, 'Skills', identified),
    saveSkill: async (skill) =>
      requiredObject<AgentSkill>((await call('skills', skill)).skill, 'Skill', identified),
    markRead: async (id, cursor) => {
      await call(`teammates/${encodeURIComponent(id)}/read`, { cursor });
    },
    list: async () => {
      const data = await call('teammates');
      if (data.version !== 1 || typeof data.enabled !== 'boolean')
        throw new VibesError('This server returned an unsupported teammate list.', 502);
      return {
        ...data,
        teammates: requiredList<Teammate>(data.teammates, 'Teammates', identified),
      };
    },
    save: async ({ name, brief, memory, avatar, budget, integrations, model, skillIds }, target) =>
      requiredObject<Teammate>(
        (
          await call(
            target.revision === undefined
              ? 'teammates'
              : `teammates/${encodeURIComponent(target.id)}`,
            {
              name,
              brief,
              memory,
              avatar,
              budget,
              integrations,
              ...(model === undefined ? {} : { model }),
              ...(skillIds === undefined ? {} : { skillIds }),
              ...(target.revision === undefined
                ? { id: target.id }
                : { revision: target.revision }),
            },
          )
        ).teammate,
        'Teammate',
        identified,
      ),
    archive: async (agent, archived) =>
      requiredObject<Teammate>(
        (
          await call(`teammates/${encodeURIComponent(agent.id)}/archive`, {
            archived,
            revision: agent.revision,
          })
        ).teammate,
        'Teammate',
        identified,
      ),
    chats: async (id) =>
      requiredList<VibesChat>(
        (await call(`teammates/${encodeURIComponent(id)}/chats`)).chats,
        'Teammate chats',
        identified,
      ),
    decide: async (id, fingerprint, decision) => {
      await call(`decisions/${encodeURIComponent(id)}`, { fingerprint, decision });
    },
  };
}
