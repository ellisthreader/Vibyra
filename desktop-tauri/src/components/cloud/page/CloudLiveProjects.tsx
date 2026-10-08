import { cloudBarCaption } from "../../../lib/cloudOverviewProgress";
import type { CloudLiveRow, CloudProgress } from "../../../lib/cloudOverviewTypes";
import type { SyncStatus } from "../../../lib/cloudSyncClient";

function CloudProjectMark({ name }: { name: string }) {
  const hue = [...name].reduce((value, c) => value + c.charCodeAt(0), 0) % 4;
  return <span className={`cloud-page__project-icon cloud-page__project-icon--${hue}`} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
}
export function CloudLiveProjects({ rows, bars, busy, onChoose, onRepair, onReview }: {
  rows: CloudLiveRow[]; bars: Record<string, CloudProgress>; busy: string | null;
  onChoose(): void; onRepair(row: CloudLiveRow): void; onReview(row: CloudLiveRow): void;
}) {
  if (!rows.length) return <div className="cloud-page__group cloud-page__empty">
    <p>Pick the projects Vibyra Cloud keeps ready for you.</p>
    <button className="cloud-page__action cloud-page__action--primary" onClick={onChoose}>Choose projects</button>
  </div>;
  return <div className="cloud-page__group" data-testid="cloud-live">
    {rows.map(row => {
      const bar = bars[row.key];
      return <div className="cloud-page__project" key={row.key} data-state={row.state} data-testid={`cloud-live-${row.name}`}>
        <CloudProjectMark name={row.name} />
        <div className="cloud-page__project-copy">
          <strong title={row.name}>{row.name}</strong><span>{row.line}</span>
          {bar?.moving && <div className="cloud-page__progress"><progress value={bar.progress} max={1} aria-label={`Estimated sync progress for ${row.name}`} />
            <small>{cloudBarCaption(bar)}</small></div>}
          {row.changes > 0 && row.localId && <button className="cloud-page__text-action" data-testid={`cloud-review-${row.localId}`} onClick={() => onReview(row)}>
            Review {row.changes} Cloud {row.changes === 1 ? "change" : "changes"}</button>}
        </div>
        {row.repair ? <button className="cloud-page__action cloud-page__action--small" disabled={!!busy} onClick={() => onRepair(row)}
          aria-label={`Sync ${row.name} again`}>{busy === `repair:${row.key}` ? "Syncing…" : "Sync again"}</button>
          : !bar?.moving && <span className="cloud-page__mark" aria-hidden="true">{row.state === "ready" ? "✓" : row.state === "paused" ? "Ⅱ" : row.state === "saved" ? "☁" : row.state === "running" ? "●" : row.state === "stuck" ? "!" : "◷"}</span>}
      </div>;
    })}
  </div>;
}

export interface CloudProjectChoice { key: string; localId: string | null; projectKey: string | null; name: string; allowed: boolean }
export function CloudProjectChoices({ projects, busy, onChange }: {
  projects: CloudProjectChoice[]; busy: boolean; onChange(project: CloudProjectChoice): void;
}) {
  return <div className="cloud-page__group">{projects.length ? projects.map(project => <button type="button" key={project.key}
    className="cloud-page__project cloud-page__project-choice" role="checkbox" aria-checked={project.allowed} disabled={busy}
    onClick={() => onChange(project)} aria-label={`${project.name} in Vibyra Cloud`}>
    <CloudProjectMark name={project.name} /><span className="cloud-page__project-copy"><strong>{project.name}</strong>
      <span>{project.allowed ? "Kept in Vibyra Cloud" : project.localId ? "Only on this computer" : "Not selected"}</span></span>
    <span className={`cloud-page__tick${project.allowed ? " is-on" : ""}`} aria-hidden="true">{project.allowed ? "✓" : ""}</span>
  </button>) : <p className="cloud-page__empty">Open a project on this computer to add it to Cloud.</p>}</div>;
}

/** Server-only projects remain manageable. Duplicate names never merge unrelated folders. */
export function cloudProjectChoices(sync: SyncStatus, server: { projectKey: string; name: string; allowed: boolean }[]): CloudProjectChoice[] {
  const rows = sync.projects.map(p => ({ key: p.id, localId: p.id, projectKey: p.projectKey ?? null, name: p.name,
    allowed: p.projectKey ? server.find(s => s.projectKey === p.projectKey)?.allowed ?? false : false }));
  return [...rows, ...server.filter(p => !sync.projects.some(s => s.projectKey === p.projectKey))
    .map(p => ({ key: p.projectKey, localId: null, projectKey: p.projectKey, name: p.name, allowed: p.allowed }))];
}
