import { useChatNeeds, useNeedsYou, useWorkingCount } from "../../lib/needsYou";
import { relativeTime } from "../../lib/relativeTime";
import { useProjectStore } from "../../state/projectStore";
import type { ProjectSpec } from "../../types";
import { ProjectTile } from "../common/ProjectTile";

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** One project below the spotlight: its tile, its name and the one fact that
 * matters most — waiting on you, an agent finished, working, or when it was
 * last opened. Remove and rename live on the sidebar row's menu. */
export function HomeProjectTile({ project }: { project: ProjectSpec }) {
  const activate = useProjectStore((s) => s.activate);
  const prompts = useNeedsYou(project.id).length;
  const chats = useChatNeeds(project.id);
  const approvals = chats.filter((need) => need.kind === "approval").length;
  const finished = chats.length - approvals;
  const working = useWorkingCount(project.id);
  const tone = prompts || approvals ? "attention" : finished ? "done" : working ? "working" : "quiet";
  const fact = approvals ? count(approvals, "Needs your approval", "need your approval")
    : prompts ? count(prompts, "Needs you", "need you")
      : finished ? count(finished, "Agent finished", "agents finished")
        : working ? `${working} working`
          : project.lastOpenedMs ? `Opened ${relativeTime(project.lastOpenedMs)}` : "Not opened yet";
  return (
    <button type="button" className={`sb-ptile sb-ptile--${tone}`} onClick={() => void activate(project.id)} aria-label={`Open ${project.name}, ${fact}`}>
      <ProjectTile id={project.id} name={project.name} size={40} />
      <span className="sb-ptile__copy">
        <b>{project.name}</b>
        <span className={`sb-ptile__fact sb-ptile__fact--${tone}`}>{tone !== "quiet" && <i className="sb-ptile__dot" />}{fact}</span>
      </span>
    </button>
  );
}
