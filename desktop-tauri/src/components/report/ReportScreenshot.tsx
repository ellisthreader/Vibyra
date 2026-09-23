import type { ReportDraft } from "../../lib/reportDraft";
import { CameraIcon, TrashIcon } from "./ReportIcons";

interface Props {
  screenshot: ReportDraft["screenshot"];
  onCapture: () => void;
  onSelect: () => void;
  onRemove: () => void;
}

export function ReportScreenshot({ screenshot, onCapture, onSelect, onRemove }: Props) {
  return (
    <section className="report__capture" aria-label="Screenshot">
      <div className="report__capture-label">Screenshot <span>optional</span></div>
      {screenshot ? (
        <figure className="report__shot">
          <img src={screenshot} alt="Screenshot attached to this report" />
          <figcaption>
            <span className="report__shot-tag">Screenshot attached</span>
            <button type="button" className="report__mini" onClick={onCapture}>
              <CameraIcon size={13} /> Replace
            </button>
            <button type="button" className="report__mini report__mini--danger" onClick={onRemove}>
              <TrashIcon size={13} /> Remove
            </button>
          </figcaption>
        </figure>
      ) : (
        <div className="report__capture-actions">
          <button type="button" className="report__capture-btn" onClick={onCapture}>
            <CameraIcon size={16} /> Capture screenshot
          </button>
          {navigator.platform.includes("Mac") && <button type="button" className="report__mini" onClick={onSelect}>
            Choose window or area
          </button>}
        </div>
      )}
    </section>
  );
}
