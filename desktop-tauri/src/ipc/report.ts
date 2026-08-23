import { invoke } from "@tauri-apps/api/core";

import type { ReportContext } from "../lib/reportContext";

/** Wire shape for `submit_report`, mirroring `src-tauri/src/report.rs`. */
export interface ReportSubmission {
  kind: string;
  severity: string;
  summary: string;
  details: string;
  steps: string | null;
  expected: string | null;
  area: string | null;
  contact: string | null;
  context: ReportContext;
  /** PNG data URL from the screenshot editor. */
  screenshot: string | null;
  /** Paths to attached images; Rust reads and vets them itself. */
  imagePaths: string[];
  /** Rust reads this pane's output itself, so it is not sent from here. */
  sessionId: number | null;
}

/** Resolves to the report id the user is shown, e.g. `VR-8F3K2Q`. */
export function submitReport(report: ReportSubmission): Promise<string> {
  return invoke("submit_report", { report });
}
