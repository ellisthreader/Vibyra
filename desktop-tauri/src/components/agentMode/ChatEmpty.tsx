import type { AgentProfile } from "../../agentTypes";
import { ChatIcon } from "../common/AgentIcons";
import { PlusIcon } from "../common/Icons";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { EmptyState } from "./EmptyState";

/** The state before the first chat. One action, and what it will do. */
export function ChatEmpty({ agent }: { agent: AgentProfile | null }) {
  const newChat = useAgentChatStore((state) => state.newChat);
  const selectChat = useAgentModeStore((state) => state.selectChat);

  const start = async () => {
    const chat = await newChat(agent?.id ?? null, agent?.engine ?? "claude");
    if (chat) selectChat(chat.id);
  };

  return (
    <div className="chat-empty">
      <EmptyState
        icon={<ChatIcon size={18} />}
        title={agent ? `Start with ${agent.name}` : "Start a chat"}
        body={
          agent
            ? "Every chat with this teammate shares its brief, memory, skills and granted folders — and nothing else. A different goal belongs in a different chat."
            : "A detached chat has no project and no folder until you give it one."
        }
        action={
          <button className="btn btn--primary" onClick={() => void start()}>
            <PlusIcon size={13} /> New chat
          </button>
        }
      />
    </div>
  );
}
