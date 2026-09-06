import type { AgentProfile, PermissionMode } from "../../agentTypes";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentDraftStore } from "../../state/agentDraftStore";
import { useAgentModeStore } from "../../state/agentModeStore";

const STARTERS: { name: string; detail: string; permission: PermissionMode; prompt: string }[] = [
  { name: "Review a release", detail: "Find blockers with source and test evidence.", permission: "plan",
    prompt: "Review the release in the granted project folder. Identify the release target and acceptance criteria first. Produce a prioritized report with file references, checks performed, failures and missing evidence. Distinguish verified findings from assumptions. Keep the review read only; propose fixes for review." },
  { name: "Make a scoped change", detail: "Produce a focused change and a checkable result.", permission: "standard",
    prompt: "Implement this change in the granted writable project folder: [describe the issue and acceptance criteria]. Inspect existing guidance and preserve unrelated work. Keep edits within scope. Run the relevant checks and report the changed files, exact check results and remaining limitations. Stop if the required scope or permission is missing." },
  { name: "Compare the evidence", detail: "Compare documents and explain the decision.", permission: "plan",
    prompt: "Compare these options using the attached documents or granted sources: [options and decision criteria]. Produce a concise recommendation, an evidence table with source references and dates, tradeoffs, assumptions and unanswered questions. Separate source facts from your judgment. If current external sources are needed but unavailable, state that gap instead of inventing citations." },
];

export function TaskStarters({ agent, chatId }: { agent: AgentProfile | null; chatId?: string }) {
  const start = async (prompt: string, permission: PermissionMode) => {
    const id = chatId ?? (await useAgentChatStore.getState().newChat(agent?.id ?? null, agent?.engine ?? "claude"))?.id;
    if (!id) return;
    useAgentDraftStore.getState().change(id, { text: prompt, permission });
    useAgentModeStore.getState().selectChat(id);
  };
  return <div className="task-starters" aria-label="Task templates">
    {STARTERS.map((item) => <button key={item.name} onClick={() => void start(item.prompt, item.permission)}>
      <strong>{item.name}</strong><span>{item.detail}</span>
    </button>)}
    <p>Choose a starting point, then edit the task before sending.</p>
  </div>;
}
