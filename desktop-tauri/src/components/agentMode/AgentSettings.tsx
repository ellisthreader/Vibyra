import type { AgentProfile } from "../../agentTypes";
import { AgentBriefCard } from "./AgentBriefCard";
import { AgentDangerCard } from "./AgentDangerCard";
import { AgentMailCard } from "./AgentMailCard";
import { AgentMemoryCard } from "./AgentMemoryCard";
import { AgentPlacesCard } from "./AgentPlacesCard";

/**
 * One teammate's settings.
 *
 * Ordered by how often a person actually changes each: the brief is the thing
 * they revise, places are what they widen, memory is what they correct, and
 * messaging and deletion are the two that need a moment's thought. Built from
 * the shared settings group/row language — the same one the app's own
 * Settings dialog uses — rather than a second vocabulary of cards.
 */
export function AgentSettings({ agent }: { agent: AgentProfile }) {
  return (
    <div className="panel">
      <div className="panel__inner agent-settings">
        <AgentBriefCard agent={agent} />
        <AgentPlacesCard agent={agent} />
        <AgentMemoryCard agent={agent} />
        <AgentMailCard agent={agent} />
        <AgentDangerCard agent={agent} />
      </div>
    </div>
  );
}
