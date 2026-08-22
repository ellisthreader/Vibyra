import {
  detailsLabel,
  gradable,
  REPORT_AREAS,
  REPORT_KINDS,
  REPORT_SEVERITIES,
  type ReportDraft,
} from "../../lib/reportDraft";

interface Props {
  draft: ReportDraft;
  patch: (patch: Partial<ReportDraft>) => void;
}

/** The written half of the report. Every question is phrased the way a person
 * would ask it — "What happened?" rather than "Description" — because the form
 * is the only chance to get a usable report out of someone mid-frustration. */
export function ReportFields({ draft, patch }: Props) {
  return (
    <>
      <fieldset className="report__group">
        <legend className="report__legend">What kind of thing is it?</legend>
        <div className="report__kinds">
          {REPORT_KINDS.map((kind) => (
            <button
              key={kind.id}
              type="button"
              className={`report__kind ${draft.kind === kind.id ? "report__kind--on" : ""}`}
              aria-pressed={draft.kind === kind.id}
              onClick={() => patch({ kind: kind.id })}
            >
              <b>{kind.label}</b>
              <span>{kind.blurb}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {gradable(draft.kind) && (
        <fieldset className="report__group">
          <legend className="report__legend">How much is it hurting?</legend>
          <div className="report__grades">
            {REPORT_SEVERITIES.map((grade) => (
              <button
                key={grade.id}
                type="button"
                title={grade.blurb}
                className={`report__grade report__grade--${grade.id} ${
                  draft.severity === grade.id ? "report__grade--on" : ""
                }`}
                aria-pressed={draft.severity === grade.id}
                onClick={() => patch({ severity: grade.id })}
              >
                {grade.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className="report__field">
        <span className="report__label">
          Where in Vibyra? <em>filled in from where you were</em>
        </span>
        <select
          className="input"
          value={draft.area}
          onChange={(event) => patch({ area: event.target.value })}
        >
          {REPORT_AREAS.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
      </label>

      <label className="report__field">
        <span className="report__label">Sum it up in one line</span>
        <input
          className="input"
          value={draft.summary}
          maxLength={300}
          placeholder="Terminal goes blank when I resize the window"
          onChange={(event) => patch({ summary: event.target.value })}
        />
      </label>

      <label className="report__field">
        <span className="report__label">{detailsLabel(draft.kind)}</span>
        <textarea
          className="input report__textarea"
          rows={4}
          value={draft.details}
          placeholder="As much or as little as you like."
          onChange={(event) => patch({ details: event.target.value })}
        />
      </label>

      {/* Collapsed by default: the two fields that most improve a report are
          also the two most likely to make someone abandon it. */}
      <details className="report__more">
        <summary>
          Steps to reproduce, and what you expected
          <em>optional — but it usually turns a guess into a fix</em>
        </summary>
        <label className="report__field">
          <span className="report__label">How can we make it happen?</span>
          <textarea
            className="input report__textarea"
            rows={3}
            value={draft.steps}
            placeholder={"1. Open two terminals\n2. Drag the divider quickly"}
            onChange={(event) => patch({ steps: event.target.value })}
          />
        </label>
        <label className="report__field">
          <span className="report__label">What did you expect instead?</span>
          <textarea
            className="input report__textarea"
            rows={2}
            value={draft.expected}
            onChange={(event) => patch({ expected: event.target.value })}
          />
        </label>
      </details>
    </>
  );
}
