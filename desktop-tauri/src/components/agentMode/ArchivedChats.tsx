import { useEffect, useState } from "react";
import type { AgentChat } from "../../agentTypes";
import { amendChat, listChats } from "../../ipc/agentChats";
import { useAgentChatStore } from "../../state/agentChatStore";

export function ArchivedChats({ agentId }: { agentId: string | null }) {
  const currentChats = useAgentChatStore((state) => state.chats[agentId ?? "detached"]);
  const [chats, setChats] = useState<AgentChat[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void listChats(agentId, true).then((rows) => { if (active) { setChats(rows); setError(""); } })
      .catch((error) => { if (active) setError(String(error)); });
    return () => { active = false; };
  }, [agentId, currentChats]);
  const restore = async (id: string) => {
    try { await amendChat(id, { archived: false }); await useAgentChatStore.getState().loadChats(agentId); }
    catch (error) { setError(String(error)); }
  };
  return <details className="archived-chats">
    <summary>Archived chats · {chats.length}</summary>
    {chats.map((chat) => <div key={chat.id}><span>{chat.title || "New chat"}</span><button className="btn btn--sm" onClick={() => void restore(chat.id)}>Restore</button></div>)}
    {error && <p className="composer__error" role="alert">{error}</p>}
  </details>;
}
