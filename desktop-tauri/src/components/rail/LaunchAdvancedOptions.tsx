import type { LaunchPermission, LaunchSettings } from "../../state/launchSettingsStore";
import { ChevronDownIcon } from "../common/Icons";

interface ChoiceProps {
  active: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

function Choice({ active, children, disabled, onClick }: ChoiceProps) {
  return (
    <button
      type="button"
      className={`launch-choice${active ? " launch-choice--active" : ""}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface LaunchAdvancedOptionsProps {
  settings: LaunchSettings;
  patch: (value: Partial<LaunchSettings>) => void;
}

/** Access and billing, folded under one row so the card stays short. */
export function LaunchAdvancedOptions({ settings, patch }: LaunchAdvancedOptionsProps) {
  const fullAccess = settings.permission === "full";

  return (
    <details className="launch-advanced">
      <summary className="launch-row">
        <span className="launch-row__label">
          <strong>Advanced</strong>
          <small>{fullAccess ? "Full access" : "Standard access"} · {settings.tokenSource === "accounts" ? "your AI accounts" : "Vibyra tokens"}</small>
        </span>
        <span className="launch-advanced__chevron"><ChevronDownIcon size={14} /></span>
      </summary>
      <div className="launch-advanced__body">
        <div className="launch-row" role="group" aria-label="Access">
          <span className="launch-row__label">
            <strong>Access</strong>
            <small className={fullAccess ? "is-warning" : undefined}>
              {fullAccess ? "Provider approvals are bypassed" : "Provider approvals stay on"}
            </small>
          </span>
          <div className="launch-segments">
            {(["standard", "full"] as LaunchPermission[]).map((permission) => (
              <Choice key={permission} active={settings.permission === permission} onClick={() => patch({ permission })}>
                {permission === "standard" ? "Standard" : "Full access"}
              </Choice>
            ))}
          </div>
        </div>

        <div className="launch-row" role="group" aria-label="Token source">
          <span className="launch-row__label">
            <strong>Billing</strong>
            <small>{settings.tokenSource === "accounts" ? "Charged to your own AI accounts" : "Vibyra tokens are not connected yet"}</small>
          </span>
          <div className="launch-segments">
            <Choice active={settings.tokenSource === "accounts"} onClick={() => patch({ tokenSource: "accounts" })}>
              My AI accounts
            </Choice>
            <Choice active={false} disabled onClick={() => undefined}>
              Vibyra tokens
            </Choice>
          </div>
        </div>
      </div>
    </details>
  );
}
