import { chatRequest } from "../ipc/sharedChats";
import { terminalTitleHints, type TitleRequest } from "../ipc/terminal";
import { useConversationTerminals } from "../state/conversationTerminalStore";
import { useConversationTitles } from "../state/conversationTitleStore";
import { conversationTitle, conversationsToName, withTitles } from "./conversationTitlePlan";

const QUICK_MS = 3_000;
const SLOW_MS = 15_000;

/**
 * Names conversation terminals after their work, the way `paneTitles.ts` names
 * PTY panes. The provider thread id comes from the Host once per conversation;
 * the requests and any agent-written title are read from transcripts already on
 * this Mac, so nothing is sent anywhere.
 */
export function startConversationTitles(): () => void {
  const threads = new Map<string, string>();
  const tried = new Set<string>();
  let busy = false;
  const thread = async (id: string) => {
    if (!threads.has(id)) {
      const status = await chatRequest<{ threadId?: string }>("conversation.status", { sessionId: id }).catch(() => null);
      if (status?.threadId) threads.set(id, status.threadId);
    }
    return threads.get(id) ?? null;
  };
  const refresh = async (scope: "unnamed" | "all") => {
    if (busy) return;
    busy = true;
    try {
      const store = useConversationTerminals.getState();
      const titles = useConversationTitles.getState().titles;
      const sessions = conversationsToName(store.sessions, titles, scope, store.open, tried);
      sessions.forEach(session => tried.add(session.id));
      const requests: TitleRequest[] = [];
      for (const [index, session] of sessions.entries()) {
        const sessionId = await thread(session.id);
        if (sessionId) requests.push({ id: index, agentId: session.kind ?? "codex", sessionId, accountId: session.accountId, conversation: true });
      }
      if (!requests.length) return;
      const next: Record<string, string> = {};
      for (const hint of await terminalTitleHints(requests)) {
        const session = sessions[hint.id];
        const title = session && conversationTitle(hint);
        if (session && title && title !== titles[session.id]) next[session.id] = title;
      }
      if (Object.keys(next).length) useConversationTitles.getState().setTitles(next);
    } catch {
      // Naming is a courtesy: a failed read leaves the names as they were.
    } finally {
      busy = false;
    }
  };
  // A new name shows at once, without waiting for the next list refresh.
  const stopWatching = useConversationTitles.subscribe(({ titles }) => {
    const { sessions } = useConversationTerminals.getState();
    const named = withTitles(sessions, titles);
    if (named.some((session, index) => session !== sessions[index])) useConversationTerminals.setState({ sessions: named });
  });
  void refresh("all");
  const quick = setInterval(() => void refresh("unnamed"), QUICK_MS);
  const slow = setInterval(() => void refresh("all"), SLOW_MS);
  return () => { clearInterval(quick); clearInterval(slow); stopWatching(); };
}
