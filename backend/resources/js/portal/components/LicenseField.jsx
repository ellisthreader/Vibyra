import React from "react";
import "../../../css/portal/licenses.css";

export default function LicenseField({ value, onChange, disabled = false }) {
  return <details className="license-disclosure"><summary>Have a license key?</summary>
    <label>License key<input type="password" value={value} onChange={e => onChange(e.target.value)}
      disabled={disabled} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={100}
      placeholder="VPRO-…" aria-describedby="license-help" /></label>
    <p id="license-help">Pro activates after your email is verified.</p>
  </details>;
}
