import { MAX_IMAGES, type ReportDraft } from "../../lib/reportDraft";
import type { ReportSurroundings } from "../../lib/reportContext";
import { CameraIcon, ImageIcon, PaperclipIcon, TerminalIcon, TrashIcon } from "./ReportIcons";

interface Props {
  draft: ReportDraft;
  patch: (patch: Partial<ReportDraft>) => void;
  surroundings: ReportSurroundings;
  onScreenshot: () => void;
  onAddImages: () => void;
  onRemoveImage: (path: string) => void;
}

/** Everything attached automatically, listed. Nothing about a report should be
 * a surprise after the fact: the user can see each value, and switch off the
 * one that carries their own terminal output. */
function facts(surroundings: ReportSurroundings): [string, string | null][] {
  const context = surroundings.context;
  return [
    ["Vibyra", context.appVersion],
    ["System", context.platform],
    ["Graphics", context.renderer],
    ["Project", context.project],
    ["Project folder", context.projectRoot],
    ["Agent", context.agent],
    ["Model", context.model],
    ["Screen", context.screen],
    ["Account", context.reporter],
  ];
}

/** The reporter's own name for a file says more than its path does. */
function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function ReportAttachments({
  draft,
  patch,
  surroundings,
  onScreenshot,
  onAddImages,
  onRemoveImage,
}: Props) {
  const listed = facts(surroundings).filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <section className="report__attach">
      {draft.screenshot ? (
        <figure className="report__shot">
          <img src={draft.screenshot} alt="The screenshot attached to this report" />
          <figcaption>
            <span className="report__shot-tag">Screenshot attached</span>
            <button type="button" className="report__mini" onClick={onScreenshot}>
              <CameraIcon size={13} /> Replace
            </button>
            <button
              type="button"
              className="report__mini report__mini--danger"
              onClick={() => patch({ screenshot: null })}
            >
              <TrashIcon size={13} /> Remove
            </button>
          </figcaption>
        </figure>
      ) : (
        <div className="report__attach-actions">
          <button type="button" className="report__attach-btn" onClick={onScreenshot}>
            <CameraIcon size={15} />
            Add screenshot
          </button>
          <button
            type="button"
            className="report__attach-btn"
            disabled={draft.images.length >= MAX_IMAGES}
            onClick={onAddImages}
          >
            <PaperclipIcon size={15} />
            {draft.images.length ? "Add another image" : "Attach image"}
          </button>
          <span className="report__images-hint">
            {draft.images.length >= MAX_IMAGES
              ? `${MAX_IMAGES} image limit reached`
              : "You can also paste an image"}
          </span>
        </div>
      )}

      {draft.screenshot && (
        <div className="report__images">
          <button
            type="button"
            className="report__mini"
            disabled={draft.images.length >= MAX_IMAGES}
            onClick={onAddImages}
          >
            <PaperclipIcon size={13} />
            {draft.images.length ? "Add another image" : "Attach image"}
          </button>
          <span className="report__images-hint">
            {draft.images.length >= MAX_IMAGES ? `${MAX_IMAGES} image limit reached` : "or paste one"}
          </span>
        </div>
      )}

      {draft.images.length > 0 && (
        <ul className="report__files">
          {draft.images.map((path) => (
            <li key={path} className="report__file">
              <ImageIcon size={14} />
              <span title={path}>{basename(path)}</span>
              <button
                type="button"
                className="report__file-x"
                aria-label={`Remove ${basename(path)}`}
                onClick={() => onRemoveImage(path)}
              >
                <TrashIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="report__context">
        <summary>
          Technical details
          <em>
            {surroundings.sessionId !== null && draft.includeTerminal
              ? "Recent terminal output included"
              : "App and system details included"}
          </em>
        </summary>
        {surroundings.sessionId !== null && (
          <label className="report__toggle">
            <input
              type="checkbox"
              checked={draft.includeTerminal}
              onChange={(event) => patch({ includeTerminal: event.target.checked })}
            />
            <TerminalIcon size={15} />
            <span>
              <b>Include recent output from {surroundings.paneName}</b>
              <em>The last 120 lines, with terminal formatting removed</em>
            </span>
          </label>
        )}
        <dl className="report__facts">
          {listed.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
