import { useEffect, useRef, useState } from "react";

import { readProjectActivity, type ProjectActivity } from "../../ipc/projectActivity";
import {
  activityBarWidth,
  activityDays,
  activitySummary,
  compactCount,
} from "../../lib/projectActivityPolicy";
import { useModalFocus } from "../../lib/useModalFocus";
import type { ProjectSpec } from "../../types";
import { CloseIcon, GitBranchIcon } from "../common/Icons";

export function ProjectActivitySheet({ project, onClose }: { project: ProjectSpec; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const [activity, setActivity] = useState<ProjectActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  useModalFocus(panel, true, onClose);

  useEffect(() => {
    let current = true;
    readProjectActivity(project.root)
      .then((result) => current && setActivity(result))
      .catch((failure) => current && setError(String(failure)));
    return () => { current = false; };
  }, [project.root]);

  const days = activity?.isGit ? activityDays(activity) : [];
  const summary = activitySummary(days);
  const max = Math.max(1, ...days.flatMap((day) => [day.additions, day.deletions]));

  return (
    <div className="project-activity__backdrop" onClick={onClose}>
      <section ref={panel} className="project-activity" role="dialog" aria-modal="true" aria-labelledby="project-activity-title" onClick={(event) => event.stopPropagation()}>
        <header className="project-activity__head">
          <div><span className="project-kicker">LAST 7 DAYS</span><h2 id="project-activity-title">Project activity</h2><p>{project.name}</p></div>
          <button className="icon-btn" type="button" title="Close activity" onClick={onClose}><CloseIcon size={15} /></button>
        </header>
        {error ? <ActivityMessage title="Activity unavailable" detail={error} /> : !activity ? (
          <ActivityMessage title="Reading Git activity…" detail="Collecting the last seven days without watching in the background." />
        ) : !activity.isGit ? (
          <ActivityMessage title="Project activity needs Git" detail="Initialize Git in this project to see daily additions and removals." />
        ) : (
          <>
            <div className="project-activity__summary">
              <Summary label="Added" value={`+${compactCount(summary.additions)}`} tone="add" />
              <Summary label="Removed" value={`−${compactCount(summary.deletions)}`} tone="delete" />
              <Summary label="Files" value={compactCount(summary.changedFiles)} />
            </div>
            {activity.truncated && <p className="project-activity__notice">Very large files or output were safely omitted.</p>}
            <div className="project-activity__days">
              {days.map((day) => (
                <div className="project-day" key={day.date} aria-label={`${day.label}: ${day.additions} lines added and ${day.deletions} removed`}>
                  <div className="project-day__date"><strong>{day.label}</strong><small>{day.shortDate} · {day.changedFiles} files</small>{day.includesWorkingTree && <span>UNCOMMITTED NOW</span>}</div>
                  <div className="project-day__bars"><i className="project-day__bar project-day__bar--add" style={{ width: activityBarWidth(day.additions, max) }} /><i className="project-day__bar project-day__bar--delete" style={{ width: activityBarWidth(day.deletions, max) }} /></div>
                  {day.additions || day.deletions ? <div className="project-day__counts"><span>+{compactCount(day.additions)}</span><span>−{compactCount(day.deletions)}</span></div> : <small className="project-day__zero">No changes</small>}
                </div>
              ))}
            </div>
            <footer className="project-activity__foot"><span><GitBranchIcon size={11} /> Git project activity · local time</span><span>Binary files excluded from line totals</span></footer>
          </>
        )}
      </section>
    </div>
  );
}

function Summary({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div><small>{label}</small><strong className={tone ? `project-stat--${tone}` : ""}>{value}</strong></div>;
}

function ActivityMessage({ title, detail }: { title: string; detail: string }) {
  return <div className="project-activity__empty"><GitBranchIcon size={22} /><strong>{title}</strong><p>{detail}</p></div>;
}
