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
        <button type="button" className="report__attach-btn" onClick={onScreenshot}>
          <CameraIcon size={18} />
          <b>Add a screenshot</b>
          <span>Grabs the screen, then lets you crop it or draw on the problem</span>
        </button>
      )}

      <div className="report__images">
        <button
          type="button"
          className="report__mini"
          disabled={draft.images.length >= MAX_IMAGES}
          onClick={onAddImages}
        >
          <PaperclipIcon size={13} />
          {draft.images.length ? "Attach another image" : "Attach images"}
        </button>
        <span className="report__images-hint">
          {draft.images.length >= MAX_IMAGES
            ? `${MAX_IMAGES} is the limit`
            : "or paste one with Ctrl + V"}
        </span>
      </div>

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
            <em>The last 120 lines, with the escape codes stripped out</em>
          </span>
        </label>
      )}

      <details className="report__context">
        <summary>
          What gets sent with this
          <em>{listed.length} details about your setup</em>
        </summary>
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
        <span className="report__label">
          How can we reach you? <em>optional</em>
        </span>
        <input
          className="input"
          value={draft.contact}
          maxLength={200}
          placeholder="Discord handle or email, if you'd like a reply"
          onChange={(event) => patch({ contact: event.target.value })}
        />
      </label>
    </section>
  );
}
