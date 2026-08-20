import { accentFor } from "../../lib/providerAccents";
import { gridColumns } from "../../lib/gridLayout";
import { launchConfigured } from "../../lib/configuredLaunch";
import { useAgentStore } from "../../state/agentStore";
import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import { AgentMark } from "../common/AgentMark";
import { TerminalPaneCard } from "./TerminalPaneCard";

function EmptyState({ projectName }: { projectName: string }) {
  const agents = useAgentStore((state) => state.agents);
  const activeId = useProjectStore((state) => state.activeId);
  const quick = agents.filter((agent) => agent.installed).slice(0, 5);

  return (
    <div className="grid-empty">
      <h2>{projectName} is quiet</h2>
      <p>
        Launch an agent — it starts in this project's folder automatically. Or press{" "}
        <kbd className="kbd">Ctrl K</kbd> for anything.
      </p>
      <div className="grid-empty__quick">
        {quick.map((agent) => {
          const accent = accentFor(agent.id, agent.accent);
          return (
            <button
              key={agent.id}
              className="quick-chip"
              style={{ "--chip-accent": accent } as React.CSSProperties}
              onClick={() => {
                if (activeId) void launchConfigured(agent, activeId);
              }}
            >
              <AgentMark agentId={agent.id} name={agent.name} accent={accent} size={18} />
              {agent.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TerminalStage() {
  const activeId = useProjectStore((state) => state.activeId);
  const projects = useProjects();
  const allPanes = useTerminalStore((state) => state.panes);
  const zoomedId = useTerminalStore((state) => state.zoomedId);
  const project = projects.find((entry) => entry.id === activeId);
  const panes = allPanes.filter((pane) => pane.projectId === activeId);
  const zoomed = zoomedId === null ? undefined : panes.find((pane) => pane.id === zoomedId);
  const columns = zoomed ? 1 : gridColumns(panes.length);

  return (
    <div className="workspace__body terminal-stage">
      {panes.length === 0 ? (
        <EmptyState projectName={project?.name ?? "This project"} />
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(" + columns + ", minmax(0, 1fr))" }}
        >
          {panes.map((pane) => (
            <TerminalPaneCard
              key={pane.id}
              pane={pane}
              hidden={zoomed !== undefined && pane.id !== zoomed.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
