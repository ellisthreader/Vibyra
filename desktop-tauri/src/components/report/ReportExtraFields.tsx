import {
  gradable,
  REPORT_AREAS,
  REPORT_KINDS,
  REPORT_SEVERITIES,
  type ReportDraft,
} from "../../lib/reportDraft";

interface Props {
  draft: ReportDraft;
  patch: (patch: Partial<ReportDraft>) => void;
  recentErrors: string[];
}

export function ReportExtraFields({ draft, patch, recentErrors }: Props) {
  return (
    <>
      <label className="report__field">
        <span className="report__label">Specific error <em>optional</em></span>
        {recentErrors.length > 0 && <select className="input report__error-choice"
          aria-label="Choose a recent app error"
          value={recentErrors.includes(draft.error) ? draft.error : ""}
          onChange={(event) => patch({ error: event.target.value })}>
          <option value="">Choose a recent error…</option>
          {recentErrors.map((message) => <option key={message} value={message}>{message}</option>)}
        </select>}
        <input className="input" value={draft.error} maxLength={2000}
          placeholder="Paste an error message"
          onChange={(event) => patch({ error: event.target.value })} />
      </label>

      <div className="report__extra-grid">
        <label className="report__field">
          <span className="report__label">Type</span>
          <select className="input" value={draft.kind}
            onChange={(event) => patch({ kind: event.target.value as ReportDraft["kind"] })}>
            {REPORT_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
          </select>
        </label>
        {gradable(draft.kind) && <label className="report__field">
          <span className="report__label">Impact</span>
          <select className="input" value={draft.severity}
            onChange={(event) => patch({ severity: event.target.value as ReportDraft["severity"] })}>
            {REPORT_SEVERITIES.map((grade) => <option key={grade.id} value={grade.id}>{grade.label}</option>)}
          </select>
        </label>}
        <label className="report__field">
          <span className="report__label">Where in Vibyra?</span>
          <select className="input" value={draft.area}
            onChange={(event) => patch({ area: event.target.value })}>
            {REPORT_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
          </select>
        </label>
      </div>

      <label className="report__field">
        <span className="report__label">Steps to reproduce <em>optional</em></span>
        <textarea className="input report__textarea" rows={3} value={draft.steps}
          placeholder="What should we do to see it?"
          onChange={(event) => patch({ steps: event.target.value })} />
      </label>
      <label className="report__field">
        <span className="report__label">What did you expect? <em>optional</em></span>
        <textarea className="input report__textarea" rows={2} value={draft.expected}
          onChange={(event) => patch({ expected: event.target.value })} />
      </label>
    </>
  );
}
