import { useState } from "react";

import type { AgentProfile } from "../../agentTypes";
import { sendHandoff } from "../../ipc/agentMail";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";

/**
 * Handing this work to another teammate.
 *
 * Only agents this one is allowed to write to appear, and the result is
 * always shown — including a refusal, in the guard's own words. "Nothing
 * happened" with no reason is indistinguishable from a bug, which is exactly
 * what a loop guard looks like from the outside if it stays silent.
 *
 * A handoff cannot widen the recipient: its turn is assembled from its own
 * brief, folders and access level. One asking to publish, spend or delete
 * becomes a decision for the user instead of a turn that runs.
 */
export function HandoffBar({ agent, allowed }: { agent: AgentProfile; allowed: string[] }) {
  const agents = useAgentRosterStore((state) => state.agents);
  const selectAgent = useAgentModeStore((state) => state.selectAgent);
  const selectChat = useAgentModeStore((state) => state.selectChat);
  const openChat = useAgentChatStore((state) => state.openChat);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [target, setTarget] = useState("");

  const peers = agents.filter((peer) => allowed.includes(peer.id));
  if (peers.length === 0) return null;

  const hand = async () => {
    const recipientId = target || peers[0].id;
    const body = note.trim();
    if (!body) return;
    const outcome = await sendHandoff({
      senderId: agent.id,
      senderName: agent.name,
      recipientId,
      body,
    }).catch((error) => ({ status: "refused" as const, message: String(error), chatId: null }));

    setResult(outcome.message);
    if (outcome.status === "delivered" && outcome.chatId) {
      setNote("");
      selectAgent(recipientId);
      selectChat(outcome.chatId);
      void openChat(outcome.chatId);
    }
  };

  return (
    <div className="handoff">
      <select value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Hand to">
        {peers.map((peer) => (
          <option key={peer.id} value={peer.id}>
            Hand to {peer.name}
          </option>
        ))}
      </select>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="What should they pick up?"
      />
      <button className="btn-ghost" disabled={!note.trim()} onClick={() => void hand()}>
        Hand over
      </button>
      {result && <p className="handoff__result">{result}</p>}
    </div>
  );
}
