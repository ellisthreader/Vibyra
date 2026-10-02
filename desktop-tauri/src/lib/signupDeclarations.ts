export const TERMS_VERSION = "2026-09-28" as const;

export interface SignupChecklist {
  termsAccepted: boolean;
  adultConfirmed: boolean;
  ukResidentConfirmed: boolean;
}

export interface SignupDeclarations {
  licenseKey?: string;
  termsVersion: typeof TERMS_VERSION;
  termsAccepted: true;
  adultConfirmed: true;
  countryCode: "GB";
}

export function signupDeclarations(checklist: SignupChecklist): SignupDeclarations | null {
  if (!checklist.termsAccepted || !checklist.adultConfirmed || !checklist.ukResidentConfirmed) return null;
  return { termsVersion: TERMS_VERSION, termsAccepted: true, adultConfirmed: true, countryCode: "GB" };
}
