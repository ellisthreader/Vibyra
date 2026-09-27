import { useAnalyticsConsentStore } from "../../state/analyticsConsentStore";

const CHOICES = [
  { id: "aggregate", label: "Share aggregate usage", note: "Feature counts and active time, without account-linked reports." },
  { id: "linked", label: "Link usage to my account", note: "Also lets Vibyra see which features this account uses." },
  { id: "declined", label: "Decline", note: "Only essential account and security records are kept." },
] as const;

export function AnalyticsChoices() {
  const choice = useAnalyticsConsentStore((s) => s.choice);
  const choose = useAnalyticsConsentStore((s) => s.choose);
  const busy = useAnalyticsConsentStore((s) => s.busy);
  const pending = useAnalyticsConsentStore((s) => s.pendingSync);
  const available = useAnalyticsConsentStore((s) => s.available);
  const error = useAnalyticsConsentStore((s) => s.error);
  return <>
    <div className="analytics-choices" aria-label="Usage analytics preference">
      {CHOICES.map((option) => <button key={option.id} type="button"
        className="analytics-choice" data-selected={choice === option.id}
        aria-pressed={choice === option.id} disabled={busy}
        onClick={() => void choose(option.id)}>
        <span className="analytics-choice__mark" aria-hidden="true" />
        <span><strong>{option.label}</strong><small>{option.note}</small></span>
      </button>)}
    </div>
    {pending ? <p className="analytics-choice__status" role="status">Tracking has stopped on this Mac. Withdrawal will sync when Vibyra reconnects.</p> : null}
    {!available && !pending ? <p className="analytics-choice__status" role="status">The account service is unavailable. Sharing stays off until your choice is saved.</p> : null}
    {error ? <p className="analytics-choice__error" role="alert">{error}</p> : null}
  </>;
}
