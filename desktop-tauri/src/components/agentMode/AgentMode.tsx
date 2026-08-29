import { useEffect, useState } from "react";

import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { AgentDashboard } from "./AgentDashboard";
import { AgentRail } from "./AgentRail";
import { AgentSurface } from "./AgentSurface";
import { DecisionsPanel } from "./DecisionsPanel";
import { NewAgentDialog } from "./NewAgentDialog";
import { RoutinesPanel } from "./RoutinesPanel";
import { SkillsPanel } from "./SkillsPanel";

/** Agent Mode: the rail, and whichever of the panels or agents is selected. */
export function AgentMode() {
  const panel = useAgentModeStore((state) => state.panel);
  const agentId = useAgentModeStore((state) => state.agentId);
  const load = useAgentRosterStore((state) => state.load);
  const adoptRunning = useAgentChatStore((state) => state.adoptRunning);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load();
    // The native side is still running whatever was running before a reload;
    // this is what stops the composer offering to send into a busy chat.
    void adoptRunning();
  }, [adoptRunning, load]);

  return (
    <>
      <AgentRail onNewAgent={() => setCreating(true)} />
      <main className="agent-main">
        {agentId ? (
          <AgentSurface />
        ) : (
          <>
            {panel === "dashboard" && <AgentDashboard />}
            {panel === "decisions" && <DecisionsPanel />}
            {panel === "routines" && <RoutinesPanel />}
            {panel === "skills" && <SkillsPanel />}
          </>
        )}
      </main>
      {creating && <NewAgentDialog onClose={() => setCreating(false)} />}
    </>
  );
}
