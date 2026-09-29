/** Keep this in step with the published Terms and the backend's accepted version. */
export const TERMS_VERSION = '2026-09-28';

export interface SignupLegalAcceptance {
  termsVersion: string;
  termsAccepted: true;
  adultConfirmed: true;
  countryCode: 'GB';
}

/** Construct this only after both initially unchecked signup confirmations. */
export const UK_SIGNUP_ACCEPTANCE: SignupLegalAcceptance = {
  termsVersion: TERMS_VERSION,
  termsAccepted: true,
  adultConfirmed: true,
  countryCode: 'GB',
};

export function assertSignupLegalAcceptance(value: SignupLegalAcceptance | undefined): asserts value is SignupLegalAcceptance {
  if (value?.termsVersion !== TERMS_VERSION || value.termsAccepted !== true ||
      value.adultConfirmed !== true || value.countryCode !== 'GB')
    throw new Error('Agree to the Terms and confirm that you are 18 or older and in the UK.');
}
