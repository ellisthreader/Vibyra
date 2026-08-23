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

/** Keep the default path to two questions. Classification and reproduction
 * detail still travel in the same draft, but stay out of the way until asked
 * for so reporting a straightforward bug never feels like filing paperwork. */
export function ReportFields({ draft, patch }: Props) {
  return (
    <>
      <label className="report__field">
        <span className="report__label">Give the problem a short title</span>
        <input
          className="input"
          data-autofocus
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
          rows={5}
          value={draft.details}
          placeholder="What were you doing, and what went wrong?"
          onChange={(event) => patch({ details: event.target.value })}
        />
      </label>

      <details className="report__more">
        <summary>
          More details
          <em>optional</em>
        </summary>
        <div className="report__more-body">
          <div className="report__option-grid">
            <label className="report__field">
              <span className="report__label">Type</span>
              <select
                className="input"
                value={draft.kind}
                onChange={(event) => patch({ kind: event.target.value as ReportDraft["kind"] })}
              >
                {REPORT_KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>

            {gradable(draft.kind) && (
              <label className="report__field">
                <span className="report__label">Impact</span>
                <select
                  className="input"
                  value={draft.severity}
                  onChange={(event) =>
                    patch({ severity: event.target.value as ReportDraft["severity"] })
                  }
                >
                  {REPORT_SEVERITIES.map((grade) => (
                    <option key={grade.id} value={grade.id}>
                      {grade.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="report__field report__field--wide">
              <span className="report__label">
                Where it happened <em>detected automatically</em>
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
          </div>

          <label className="report__field">
            <span className="report__label">Steps to reproduce</span>
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
          <label className="report__field">
            <span className="report__label">
              Contact details <em>optional</em>
            </span>
            <input
              className="input"
              value={draft.contact}
              maxLength={200}
              placeholder="Email or Discord handle, if you'd like a reply"
              onChange={(event) => patch({ contact: event.target.value })}
            />
          </label>
        </div>
      </details>
    </>
  );
}
