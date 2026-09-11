import { Platform } from 'react-native';
import * as Apple from 'expo-apple-authentication';
import * as Browser from 'expo-web-browser';
import type { AccountProvider, ProviderApi } from './accountApi';
import { browserProvider } from './browserProvider';

export async function signInWithProvider(api: ProviderApi, provider: AccountProvider, signal: AbortSignal) {
  if (signal.aborted) return null;
  if (provider === 'apple' && Platform.OS === 'ios') {
    if (!await Apple.isAvailableAsync()) throw new Error('Apple sign-in isn’t available on this device. Please use Google or email.');
    const challenge = await api.appleChallenge(signal);
    if (signal.aborted) return null;
    try {
      const credential = await Apple.signInAsync({ nonce: challenge.nonce,
        requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL] });
      if (signal.aborted) return null;
      if (!credential.identityToken) throw new Error('Apple did not return a sign-in token. Please try again.');
      const name = credential.fullName ? Apple.formatFullName(credential.fullName) : '';
      return await api.providerToken(credential.identityToken, challenge.challengeId, name, signal);
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
      throw error;
    }
  }
  let closed = false;
  let opened = false;
  let failure: unknown;
  const close = () => { if (opened && !closed) { closed = true; Browser.dismissAuthSession(); } };
  signal.addEventListener('abort', close);
  try {
    return await browserProvider(api, provider, signal, {
      open: url => {
        opened = true;
        void Browser.openAuthSessionAsync(url, 'vibyra://auth-complete').then(() => { closed = true; })
          .catch(error => { failure = error; closed = true; });
      },
      closed: () => { if (failure) throw new Error('The sign-in browser could not open. Please try again.'); return closed; },
      close,
    });
  } finally { signal.removeEventListener('abort', close); }
}
