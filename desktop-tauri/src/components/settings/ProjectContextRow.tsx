import { SettingHint } from "./SettingHint";
import { StatusChip } from "./SettingsControls";
import { SettingRow, Switch, type SettingsPaneProps } from "./SettingsShared";

/** What a question carries when the switch is on. Short lines: this is a
 * summary read on hover, not the brief itself. */
const SENT = [
  "The project's shape, stack and scripts.",
  "Its git branch and the names of changed files.",
  "Which terminals are open.",
  "Notes from this project's memory.",
];

/**
 * Whether the workspace assistant is told what the project actually is.
 *
 * This lives under Privacy rather than beside the OpenAI key: it is the one
 * switch that decides whether anything about your code leaves the Mac, so it
 * should not sit three levels down in Advanced.
 *
 * The detail sits behind the "?" for the same reason it does on Performance —
 * the row itself should read in one line. No card of its own either: Privacy
 * is one group, so its rows share a border and separators.
 */
export function ProjectContextRow({ settings, update }: SettingsPaneProps) {
  const on = settings.sendProjectContext !== false;
  return (
    <SettingRow
      label={
        <span className="setting-label">
          Send project context to the assistant
          <SettingHint label="What is sent to the assistant">
            <p className="setting-hint__title">
              <span>Sent with each question</span>
              <StatusChip tone={on ? "on" : "off"}>
                {on ? `${SENT.length} items` : "Name and folder only"}
              </StatusChip>
            </p>
            {on ? (
              <>
                <ul className="setting-hint__list">
                  {SENT.map((line) => (
                    <li key={line}>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <p className="setting-hint__note">
                  File contents and terminal output are never sent.
                </p>
              </>
            ) : (
              <p className="setting-hint__note">
                The project's name and folder, and nothing else.
              </p>
            )}
          </SettingHint>
        </span>
      }
      hint="What chat is told about the project you ask about."
    >
      <Switch
        checked={on}
        onChange={(sendProjectContext) => void update({ sendProjectContext })}
        label="Send project context to the assistant"
      />
    </SettingRow>
  );
}
