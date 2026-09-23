import { detailsLabel, type ReportDraft } from "../../lib/reportDraft";

interface Props {
  draft: ReportDraft;
  patch: (patch: Partial<ReportDraft>) => void;
}

export function ReportFields({ draft, patch }: Props) {
  return (
    <div className="report__primary">
      <label className="report__field">
        <span className="report__label">What went wrong?</span>
        <input
          className="input"
          value={draft.summary}
          maxLength={300}
          placeholder="A short summary"
          onChange={(event) => patch({ summary: event.target.value })}
        />
      </label>
      <label className="report__field">
        <span className="report__label">{detailsLabel(draft.kind)}</span>
        <textarea
          className="input report__textarea"
          rows={5}
          value={draft.details}
          placeholder="Tell us what you were doing and what happened."
          onChange={(event) => patch({ details: event.target.value })}
        />
      </label>
    </div>
  );
}
