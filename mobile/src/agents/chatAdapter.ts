import type { VibesApi } from '../vibes/types';
import type { AgentsApi, Teammate } from './types';

/** Use the existing quote/send protocol, with a dedicated history and no new-chat fallback. */
export function teammateChatApi(api: VibesApi, agents: AgentsApi, teammate: Teammate): VibesApi {
  return { ...api, guest: undefined, chats: () => agents.chats(teammate.id),
    createChat: async () => { throw new Error('Reopen this teammate to restore its conversation.'); },
    quote: (chat, ...args) => {
      if (chat !== teammate.chatId) return Promise.reject(new Error('This conversation belongs to another teammate.'));
      return api.quote(chat, ...args);
    }, attach: undefined, toolResult: undefined,
  };
}
