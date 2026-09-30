import { useRef } from "react";

import { useModalFocus } from "../../lib/useModalFocus";
import { accountOpenLegal } from "../../ipc/account";
import { useAnalyticsConsentStore } from "../../state/analyticsConsentStore";
import { AnalyticsChoices } from "./AnalyticsChoices";

export function AnalyticsConsentDialog({ suspended = false }: { suspended?: boolean }) {
  const choice = useAnalyticsConsentStore((s) => s.choice);
  const loaded = useAnalyticsConsentStore((s) => s.loaded);
  const dismissed = useAnalyticsConsentStore((s) => s.dismissed);
  const dismiss = useAnalyticsConsentStore((s) => s.dismiss);
  const dialogRef = useRef<HTMLElement>(null);
  const open = loaded && !dismissed && choice === "unknown" && !suspended;
  useModalFocus(dialogRef, open, dismiss);
  if (!open) return null;
  return <div className="analytics-consent-backdrop">
    <section ref={dialogRef} className="analytics-consent" role="dialog" aria-modal="true" aria-labelledby="analytics-consent-title">
      <button type="button" className="analytics-consent__close" aria-label="Decide later" onClick={dismiss}>×</button>
      <span className="analytics-consent__eyebrow">YOUR CHOICE</span>
      <h2 id="analytics-consent-title">Help shape Vibyra</h2>
      <p>Choose whether we can measure feature use, prompt counts, active time and approximate country. We never collect your prompt text, terminal output, project names or file paths for analytics.</p>
      <AnalyticsChoices />
      <p className="analytics-consent__foot">Your choice does not affect the app. Change it at any time in Settings → Privacy. <button type="button" onClick={() => void accountOpenLegal("privacy")}>Privacy Policy</button></p>
    </section>
  </div>;
}
