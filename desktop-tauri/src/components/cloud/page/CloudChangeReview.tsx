import { useEffect, useState } from "react";
import { cloudSync } from "../../../ipc/cloudSync";
import type { ChangeApplied, ChangeReview, FileReviewData } from "../../../lib/cloudSyncClient";
import type { CloudConfirmation } from "./CloudPageConfirm";
import type { CloudPageController } from "./useCloudPage";

/** The existing native review contract keeps conflicts local and binds Apply to this exact reviewed snapshot. */
export function CloudChangeReview({ project, controller, confirm }: {
  project: { id: string; name: string }; controller: CloudPageController; confirm(value: CloudConfirmation): void;
}) {
  const [review, setReview] = useState<ChangeReview | null>(null), [loaded, setLoaded] = useState(false);
  const [file, setFile] = useState<FileReviewData | null>(null), [result, setResult] = useState<ChangeApplied | null>(null);
  const { run, current, refresh } = controller;
  useEffect(() => {
    let live = true;
    void run("review", () => cloudSync.changeReview(project.id)).then(next => {
      if (live && current()) { setReview(next); setLoaded(true); }
    });
    return () => { live = false; };
  }, [project.id, run, current]);
  const openFile = async (path: string) => {
    const next = await run(`file:${path}`, () => cloudSync.changeFile(project.id, path));
    if (next && current()) setFile(next);
  };
  const apply = () => {
    if (!review) return;
    const approved = review;
    confirm({ title: `Apply Cloud changes to ${project.name}?`,
      detail: "Safe changes are applied to this computer with a backup. Conflicting files keep this computer’s version.", action: "Apply safe changes",
      run: () => { void run("apply", () => cloudSync.changeApply(project.id, approved)).then(next => {
        if (next && current()) { setResult(next); setReview(null); setFile(null); void refresh(); }
      }); },
    });
  };
  const paths = [...new Set([...(review?.changes ?? []), ...(review?.conflicts ?? [])])];
  return <section data-testid="cloud-review"><h2 className="cloud-page__sub-title">Cloud changes</h2>
    <p className="cloud-page__description">{project.name}</p>
    {!loaded && <p className="cloud-page__description">Checking changes…</p>}
    {result ? <div className="cloud-page__group cloud-page__empty" role="status">
      <strong>{result.applied.length} {result.applied.length === 1 ? "change applied" : "changes applied"}</strong>
      {result.conflicts.length > 0 && <p>{result.conflicts.length} conflicting files kept this computer’s version.</p>}
      {result.unapplied.length > 0 && <p>{result.unapplied.length} files could not be applied. Review them before trying again.</p>}
      {result.backup && <p className="cloud-page__path">Backup: {result.backup}</p>}
    </div> : review ? <>
      <p className="cloud-page__footnote">{review.conflicts.length > 0 ? "Conflicting files keep this computer’s version. Review both versions below." : "Review the files before applying. A backup is kept on this computer."}</p>
      <div className="cloud-page__group">{paths.map(path => <button type="button" key={path} className="cloud-page__nav-row"
        disabled={!!controller.busy} onClick={() => void openFile(path)}>
        <span><strong className="cloud-page__path">{path}</strong><small>{review.conflicts.includes(path) ? "Conflict · kept on this computer" : "Safe change"}</small></span><span aria-hidden="true">›</span>
      </button>)}</div>
      {review.unapplied.length > 0 && <p className="cloud-page__footnote">{review.unapplied.length} files cannot be applied automatically.</p>}
      <button type="button" className="cloud-page__action cloud-page__action--primary" disabled={!!controller.busy || !review.changes.length}
        onClick={apply}>Apply safe changes</button>
    </> : loaded && !controller.error && <p className="cloud-page__description">No Cloud changes need review.</p>}
    {file && <div className="cloud-page__file"><h3>{file.path}</h3>
      {(["local", "cloud"] as const).map(side => <details key={side} open><summary>{side === "local" ? "This computer" : "Vibyra Cloud"}</summary>
        {file[side].missing ? <p>File not present</p> : file[side].binary ? <p>Binary file · {file[side].bytes ?? 0} bytes</p>
          : <pre>{file[side].text ?? "Preview unavailable"}{file[side].truncated ? "\n…Preview truncated" : ""}</pre>}</details>)}
    </div>}
  </section>;
}
