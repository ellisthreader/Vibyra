import type { LaunchPermission, LaunchSettings } from "../../state/launchSettingsStore";
import { CheckIcon, ChevronDownIcon } from "../common/Icons";

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

export function LaunchAdvancedOptions({ settings, patch }: LaunchAdvancedOptionsProps) {
  const fullAccess = settings.permission === "full";

  return (
    <details className="launch-advanced">
      <summary>
        <span>Advanced options</span>
        <span className="launch-advanced__chevron"><ChevronDownIcon size={12} /></span>
      </summary>
      <div className="launch-advanced__body">
        <div className="launch-advanced__surface">
          <button
            type="button"
            className={`launch-safe${settings.safeMode ? " launch-safe--active" : ""}`}
            aria-pressed={settings.safeMode}
            onClick={() => patch({ safeMode: !settings.safeMode })}
          >
            <span className="launch-safe__copy">
              <span><strong>Safe mode</strong><em>Recommended</em></span>
              <small>Separate branch for each terminal</small>
            </span>
            <span className="launch-switch" aria-hidden="true"><i /></span>
          </button>

          <fieldset className="launch-field launch-field--access">
            <legend>Access</legend>
            <div className="launch-segments launch-segments--wide">
              {(["standard", "full"] as LaunchPermission[]).map((permission) => (
                <Choice
                  key={permission}
                  active={settings.permission === permission}
                  onClick={() => patch({ permission })}
                >
                  {permission === "standard" ? "Standard" : "Full access"}
                </Choice>
              ))}
            </div>
            <small className={`launch-field__hint${fullAccess ? " launch-field__hint--warning" : ""}`}>
              {fullAccess ? "Provider approvals are bypassed" : "Provider approvals stay on"}
            </small>
          </fieldset>

          <fieldset className="launch-field launch-field--tokens">
            <legend>Token source</legend>
            <div className="launch-token-list">
              <Choice active={settings.tokenSource === "accounts"} onClick={() => patch({ tokenSource: "accounts" })}>
                <span className="launch-choice__copy"><strong>My AI accounts</strong><small>Provider billing</small></span>
                <span className="launch-choice__mark" aria-hidden="true"><CheckIcon size={12} /></span>
              </Choice>
              <Choice active={false} disabled onClick={() => undefined}>
                <span className="launch-choice__copy"><strong>Vibyra tokens</strong><small>Not connected yet</small></span>
              </Choice>
            </div>
          </fieldset>
        </div>
      </div>
    </details>
  );
}
