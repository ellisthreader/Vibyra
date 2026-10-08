export function AuthLicenseField({ value, onChange, disabled }: {
  value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  return <details className="auth-license"><summary>Have a license key?</summary>
    <label>License key<input type="password" value={value} onChange={e => onChange(e.target.value)}
      maxLength={100} autoComplete="off" spellCheck={false} disabled={disabled} placeholder="VPRO-…" /></label>
    <p>Pro activates after your email is verified.</p>
  </details>;
}
