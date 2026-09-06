import { useState } from "react";
import type { AgentRun } from "../../agentRunTypes";
import { activeRun } from "../../agentRunTypes";
import { useAgentRunStore } from "../../state/agentRunStore";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { relativeTime } from "../../lib/relativeTime";
import { TaskDetails } from "./TaskDetails";
import { PanelHead } from "./PanelHead";
import "../../styles/agent-tasks.css";

const LABELS: Record<AgentRun["status"], string> = {
  running: "Working", waiting: "Needs a decision", succeeded: "Completed",
  failed: "Failed", cancelled: "Stopped", interrupted: "Interrupted",
};
export function TaskHistory({ compact = false }: { compact?: boolean }) {
  const runs = useAgentRunStore((state) => state.runs);
  const error = useAgentRunStore((state) => state.error);
  const refresh = useAgentRunStore((state) => state.refresh);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const shown = runs.filter((run) =>
    (!compact || !activeRun(run)) &&
    (filter === "all" || (filter === "active" ? activeRun(run) : run.status === filter)) &&
    `${run.spec.prompt} ${run.spec.agentName}`.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, compact ? 5 : 100);
  const open = (run: AgentRun) => {
    const mode = useAgentModeStore.getState();
    mode.setMode(run.agentId ? "agent" : "chat"); mode.selectAgent(run.agentId); mode.selectChat(run.chatId);
    void useAgentChatStore.getState().openChat(run.chatId);
  };
  const content = <>
    {!compact && <div className="task-history__filters">
      <input aria-label="Search tasks" placeholder="Search tasks or teammates" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select aria-label="Filter tasks by status" value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="all">All tasks</option><option value="active">In progress</option>
        <option value="succeeded">Completed</option><option value="failed">Failed</option>
        <option value="cancelled">Stopped</option><option value="interrupted">Interrupted</option>
      </select>
    </div>}
    {error && <p className="composer__error" role="alert">{error} <button onClick={() => void refresh()}>Try again</button></p>}
    {shown.length === 0 && <p className="task-history__empty">{query || filter !== "all" ? "No tasks match these filters." : compact ? "Finished tasks and their outcomes appear here." : "Tasks will appear here when a conversation or routine starts. Each keeps its outcome, access settings and saved outputs."}</p>}
    <ol className="task-history__list">
      {shown.map((run) => <li className="task-history__item" key={run.id}>
        <div className="task-history__row">
          <button className="task-history__title" aria-expanded={expanded === run.id} onClick={() => setExpanded(expanded === run.id ? null : run.id)}>
            <span>{run.spec.prompt || "Untitled task"}</span>
            <small>{run.spec.agentName} · {relativeTime(run.startedMs)}</small>
          </button>
          <span className={`task-status task-status--${run.status}`}>{LABELS[run.status]}</span>
          <button className="btn btn--sm" onClick={() => open(run)}>Open chat</button>
          {activeRun(run) && <button className="btn btn--sm" onClick={() => void useAgentChatStore.getState().cancel(run.chatId)}>Stop</button>}
        </div>
        {expanded === run.id && <TaskDetails run={run} />}
      </li>)}
    </ol>
  </>;
  if (compact) return content;
  return <div className="panel"><div className="panel__inner">
    <PanelHead title="Task history" blurb="Inspect active work and the most recent 100 tasks, with original instructions and saved outputs." />
    {content}
  </div></div>;
}
