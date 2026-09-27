import { Platform } from 'react-native';
import * as Apple from 'expo-apple-authentication';
import * as Browser from 'expo-web-browser';
import type { AccountProvider, ProviderApi } from './accountApi';
import { appleSheet, appleSheetError, appleSheetMissing } from './appleSheet';
import { browserProvider } from './browserProvider';

export async function signInWithProvider(
  api: ProviderApi,
  provider: AccountProvider,
  signal: AbortSignal,
) {
  if (signal.aborted) return null;
  // Apple on an iPhone is only ever Apple's own sheet; see appleSheet.ts.
  if (provider === 'apple' && Platform.OS === 'ios') {
    if (!appleSheet) throw new Error(appleSheetMissing);
    const challenge = await api.appleChallenge(signal);
    if (signal.aborted) return null;
    let credential: Apple.AppleAuthenticationCredential;
    try {
      credential = await Apple.signInAsync({
        nonce: challenge.nonce,
        requestedScopes: [
          Apple.AppleAuthenticationScope.FULL_NAME,
          Apple.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (error) {
      const failure = appleSheetError(error);
      if (!failure) return null;
      throw failure;
    }
    if (signal.aborted) return null;
    if (!credential.identityToken)
      throw new Error('Apple did not return a sign-in token. Please try again.');
    const name = credential.fullName ? Apple.formatFullName(credential.fullName) : '';
    return await api.providerToken(credential.identityToken, challenge.challengeId, name, signal);
  }
  // Google, and Apple off the iPhone, sign in on the provider's page in the system browser.
  let closed = false;
  let opened = false;
  let failure: unknown;
  const close = () => {
    if (opened && !closed) {
      closed = true;
      Browser.dismissAuthSession();
    }
  };
  signal.addEventListener('abort', close);
  try {
    return await browserProvider(api, provider, signal, {
      open: (url) => {
        opened = true;
        void Browser.openAuthSessionAsync(url, 'vibyra://auth-complete')
          .then(() => {
            closed = true;
          })
          .catch((error) => {
            failure = error;
            closed = true;
          });
      },
      closed: () => {
        if (failure) throw new Error('The sign-in browser could not open. Please try again.');
        return closed;
      },
      close,
    });
  } finally {
    signal.removeEventListener('abort', close);
  }
}
