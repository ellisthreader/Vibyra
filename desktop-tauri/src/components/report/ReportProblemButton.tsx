import { useReportStore } from "../../state/reportStore";
import { HelpIcon } from "../common/Icons";

export function ReportProblemButton() {
  return (
    <button className="pstrip__row" type="button" onClick={() => void useReportStore.getState().begin()}>
      <HelpIcon size={16} />
      <span className="pstrip__name">Report a problem</span>
    </button>
  );
}
