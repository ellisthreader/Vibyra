import { useEffect } from "react";

import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { AgentChatRail } from "./AgentChatRail";
import { AgentHeader } from "./AgentHeader";
import { AgentSettings } from "./AgentSettings";
import { AgentSkillsTab } from "./AgentSkillsTab";
import { ChatSurface } from "./ChatSurface";

/**
 * One teammate: its chats down the side, its work in the middle.
 *
 * The three tabs are the whole of an agent — what it is doing, what it knows
 * how to do, and how it is set up. Everything else that could have been a tab
 * (memory, places, mail) lives inside Settings, because those are things a
 * person changes occasionally and reads never.
 */
export function AgentSurface() {
  const agentId = useAgentModeStore((state) => state.agentId);
  const tab = useAgentModeStore((state) => state.tab);
  const agent = useAgentRosterStore((state) =>
    state.agents.find((entry) => entry.id === agentId),
  );
  const loadChats = useAgentChatStore((state) => state.loadChats);
  const loadPlaces = useAgentRosterStore((state) => state.loadPlaces);

  useEffect(() => {
    if (!agentId) return;
    void loadChats(agentId);
    void loadPlaces(agentId);
  }, [agentId, loadChats, loadPlaces]);

  if (!agent) return null;

  return (
    <div className={`agent-surface ${tab === "chats" ? "" : "agent-surface--wide"}`}>
      {tab === "chats" && <AgentChatRail agent={agent} />}
      <section className="agent-surface__main">
        <AgentHeader agent={agent} />
        {tab === "chats" && <ChatSurface agent={agent} />}
        {tab === "skills" && <AgentSkillsTab agent={agent} />}
        {tab === "settings" && <AgentSettings agent={agent} />}
      </section>
    </div>
  );
}
