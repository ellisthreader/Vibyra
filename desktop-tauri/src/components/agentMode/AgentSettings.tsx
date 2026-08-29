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
 * messaging and deletion are the two that need a moment's thought. Uses the
 * shared settings row/card language rather than inventing a second one.
 */
export function AgentSettings({ agent }: { agent: AgentProfile }) {
  return (
    <div className="settings-pane agent-settings">
      <AgentBriefCard agent={agent} />
      <AgentPlacesCard agent={agent} />
      <AgentMemoryCard agent={agent} />
      <AgentMailCard agent={agent} />
      <AgentDangerCard agent={agent} />
    </div>
  );
}
