import { MAX_IMAGES, type ReportDraft } from "../../lib/reportDraft";
import type { ReportSurroundings } from "../../lib/reportContext";
import { ImageIcon, PaperclipIcon, TrashIcon } from "./ReportIcons";

interface Props {
  draft: ReportDraft;
  patch: (patch: Partial<ReportDraft>) => void;
  surroundings: ReportSurroundings;
  onAddImages: () => void;
  onRemoveImage: (path: string) => void;
}

function facts(surroundings: ReportSurroundings): [string, string | null][] {
  const context = surroundings.context;
  return [
    ["Version / build", context.appVersion],
    ["System", context.platform],
    ["Graphics", context.renderer],
    ["Project", context.project],
    ["Agent", context.agent],
    ["Model", context.model],
    ["Screen", context.screen],
    ["Account", context.reporter],
  ];
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function ReportAttachments({ draft, patch, surroundings, onAddImages, onRemoveImage }: Props) {
  const listed = facts(surroundings).filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <>
      <div className="report__option-section">
        <span className="report__option-title">Additional images</span>
        <div className="report__images">
          <button type="button" className="report__mini" disabled={draft.images.length >= MAX_IMAGES}
            onClick={onAddImages}>
            <PaperclipIcon size={14} />
            {draft.images.length ? "Attach another image" : "Attach images"}
          </button>
          <span className="report__images-hint">
            {draft.images.length >= MAX_IMAGES ? `${MAX_IMAGES} is the limit` : "You can also paste an image"}
          </span>
        </div>
        {draft.images.length > 0 && <ul className="report__files">
          {draft.images.map((path) => (
            <li key={path} className="report__file">
              <ImageIcon size={14} />
              <span title={path}>{basename(path)}</span>
              <button type="button" className="report__file-x" aria-label={`Remove ${basename(path)}`}
                onClick={() => onRemoveImage(path)}>
                <TrashIcon size={12} />
              </button>
            </li>
          ))}
        </ul>}
      </div>

      {surroundings.sessionId !== null && <div className="report__option-section">
        <span className="report__option-title">Terminal output</span>
        <label className="report__toggle">
          <input type="checkbox" checked={draft.includeTerminal}
            onChange={(event) => patch({ includeTerminal: event.target.checked })} />
          <span>
            <b>Include recent terminal output</b>
            <em>Last 120 lines from {surroundings.paneName}</em>
          </span>
        </label>
      </div>}

      <details className="report__context">
        <summary>Review included app details</summary>
        <dl className="report__facts">
          {listed.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </details>

      <label className="report__field">
        <span className="report__label">Contact for a reply <em>optional</em></span>
        <input className="input" value={draft.contact} maxLength={200}
          placeholder="Email or Discord handle"
          onChange={(event) => patch({ contact: event.target.value })} />
      </label>
    </>
  );
}
