import { accountOpenLegal } from "../../ipc/account";
import type { SignupChecklist } from "../../lib/signupDeclarations";

interface AuthSignupDeclarationsProps {
  value: SignupChecklist;
  onChange: (value: SignupChecklist) => void;
}

export function AuthSignupDeclarations({ value, onChange }: AuthSignupDeclarationsProps) {
  return <fieldset className="auth-signup-declarations">
    <legend>Before creating an account</legend>
    <label><input type="checkbox" checked={value.termsAccepted} onChange={(event) => onChange({ ...value, termsAccepted: event.target.checked })} />
      <span>I agree to the <button type="button" onClick={() => void accountOpenLegal("terms")}>Terms of Service</button>. <small>Read the <button type="button" onClick={() => void accountOpenLegal("privacy")}>Privacy Policy</button> to see how we use your information.</small></span></label>
    <label><input type="checkbox" checked={value.adultConfirmed} onChange={(event) => onChange({ ...value, adultConfirmed: event.target.checked })} />
      <span>I am 18 or older.</span></label>
    <label><input type="checkbox" checked={value.ukResidentConfirmed} onChange={(event) => onChange({ ...value, ukResidentConfirmed: event.target.checked })} />
      <span>I currently reside in the United Kingdom. <small>New accounts are available to UK residents during this launch stage.</small></span></label>
  </fieldset>;
}
