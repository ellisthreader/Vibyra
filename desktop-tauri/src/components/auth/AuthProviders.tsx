import { oauthProgressCopy } from "../../lib/accountPolicy";
import { AppleMark, AuthSpinner, EmailMark, GoogleMark } from "./authMarks";

interface AuthProvidersProps {
  authorizing: boolean;
  pendingProvider: string | null;
  providerError: string | null;
  emailOpen: boolean;
  onProvider: (provider: "google" | "apple") => void;
  onCancel: () => void;
  onToggleEmail: () => void;
}

export function AuthProviders({
  authorizing,
  pendingProvider,
  providerError,
  emailOpen,
  onProvider,
  onCancel,
  onToggleEmail,
}: AuthProvidersProps) {
  const waitingOn = authorizing ? pendingProvider : null;
  return (
    <div className="auth-choices">
      <div className="auth-choices__group">
        <button
          className="auth-choice"
          disabled={authorizing}
          onClick={() => onProvider("google")}
        >
          <span className="auth-choice__mark">
            <GoogleMark />
          </span>
          Continue with Google
        </button>
        <button
          className="auth-choice"
          disabled={authorizing}
          onClick={() => onProvider("apple")}
        >
          <span className="auth-choice__mark auth-choice__mark--apple">
            <AppleMark />
          </span>
          Continue with Apple
        </button>
      </div>
      <div className="auth-provider-status" role="status" aria-live="polite">
        {waitingOn && (
          <>
            <AuthSpinner />
            <span>{oauthProgressCopy(waitingOn)}</span>
            <button type="button" className="auth-link" onClick={onCancel}>
              Cancel
            </button>
          </>
        )}
        {!waitingOn && providerError && (
          <span className="auth-provider-status__error">{providerError}</span>
        )}
      </div>
      <div className="auth-divider" aria-hidden="true">
        <span>or</span>
      </div>
      <button
        className={`auth-choice auth-choice--email ${emailOpen ? "auth-choice--open" : ""}`}
        disabled={authorizing}
        aria-expanded={emailOpen}
        onClick={onToggleEmail}
      >
        <span className="auth-choice__mark auth-choice__mark--email">
          <EmailMark />
        </span>
        Continue with email
        <span className="auth-choice__chevron" aria-hidden="true" />
      </button>
    </div>
  );
}
