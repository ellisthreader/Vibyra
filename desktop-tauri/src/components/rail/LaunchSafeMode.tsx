import { useSafeWorkspaceSupport } from "../../lib/useSafeWorkspaceSupport";

interface Props {
  projectRoot: string | null;
  value: boolean;
  onChange(value: boolean): void;
}

/**
 * The launcher's Safe mode switch. Safe mode gives each terminal its own
 * branch, so it needs a Git repository to branch from: in a plain folder the
 * switch reads as unavailable rather than arming a launch that could only
 * fail, and the launch runs in the folder itself.
 */
export function LaunchSafeMode({ projectRoot, value, onChange }: Props) {
  const available = useSafeWorkspaceSupport(projectRoot).supported !== false;
  const on = available && value;
  return (
    <button
      type="button"
      className={`launch-safe${on ? " launch-safe--active" : ""}`}
      aria-pressed={on}
      disabled={!available}
      title={available ? undefined : "Safe mode branches from Git, and this folder is not a repository. Set one up in the Worktrees sidebar."}
      onClick={() => onChange(!value)}
    >
      <span className="launch-switch" aria-hidden="true"><i /></span>
      <span className="launch-safe__copy">
        <strong>Safe mode</strong>
        <small>
          {!available
            ? "Needs a Git repository"
            : on
              ? "Own branch per terminal"
              : "Works on the current branch"}
        </small>
      </span>
    </button>
  );
}
