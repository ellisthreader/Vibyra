import { AnalyticsChoices } from "./AnalyticsChoices";

export function AnalyticsSettings() {
  return <div className="analytics-settings">
    <div className="analytics-settings__intro">
      <strong>Usage analytics</strong>
      <span>Share feature counts, active time and approximate country to help improve Vibyra. Prompt text, terminal output, project names and file paths are never included.</span>
    </div>
    <AnalyticsChoices />
  </div>;
}
