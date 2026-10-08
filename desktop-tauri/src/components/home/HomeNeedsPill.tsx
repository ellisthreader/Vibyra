import { openNeedsYou } from "../../lib/needsYou";
import type { ProjectSpec } from "../../types";
import { ChevronIcon } from "../common/Icons";
import { ProjectTile } from "../common/ProjectTile";

/** Home's way into Needs you: the projects waiting on you as a small stack of
 * their tiles, then the count. Only shown while something waits. */
export function HomeNeedsPill({ count, projects }: { count: number; projects: ProjectSpec[] }) {
  const shown = projects.slice(0, 3);
  return <button type="button" className="sb-needs-pill" onClick={openNeedsYou}
    aria-label={`${count} ${count === 1 ? "thing needs" : "things need"} you${projects.length ? ` in ${projects.map((project) => project.name).join(", ")}` : ""}`}>
    {shown.length > 0
      ? <span className="sb-needs-pill__stack" aria-hidden="true">{shown.map((project) => <ProjectTile key={project.id} id={project.id} name={project.name} size={20} />)}</span>
      : <i className="sb-needs-pill__dot" aria-hidden="true" />}
    <span className="sb-needs-pill__text"><b>{count}</b> {count === 1 ? "needs" : "need"} you</span>
    <ChevronIcon size={12} />
  </button>;
}
