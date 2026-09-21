import { Platform } from 'react-native';
import * as Apple from 'expo-apple-authentication';
import * as Browser from 'expo-web-browser';
import type { AccountProvider, ProviderApi } from './accountApi';
import { appleSheet, appleSheetError, appleSheetMissing } from './appleSheet';
import { browserFlow } from './browserProvider';
import { finishedAnyway } from './deletionCheck';
import type { ProfileApi } from './profileApi';

type Api = ProviderApi & Pick<ProfileApi, 'deleteWithApple' | 'startDeletion' | 'deletionStatus'>;

/**
 * Deleting an Apple or Google account proves it is theirs by signing in with that
 * provider once more. On an iPhone, Apple is always its own sheet, one tap; every
 * other case is the browser round-trip the backend already runs for Vibyra Desktop,
 * whose callback deletes the account itself. False means the person backed out.
 */
export async function deleteWithProvider(api: Api, provider: AccountProvider, token: string, signal: AbortSignal) {
  if (signal.aborted) return false;
  if (provider === 'apple' && Platform.OS === 'ios') {
    if (!appleSheet) throw new Error(appleSheetMissing);
    const challenge = await api.appleChallenge(signal);
    if (signal.aborted) return false;
    let identityToken: string | null;
    try { identityToken = (await Apple.signInAsync({ nonce: challenge.nonce })).identityToken; }
    catch (error) { const failure = appleSheetError(error); if (!failure) return false; throw failure; }
    if (!identityToken) throw new Error('Apple did not confirm it’s you. Please try again.');
    if (signal.aborted) return false;
    await api.deleteWithApple(token, challenge.challengeId, identityToken);
    return true;
  }
  let flowId: string | null = null;
  let closed = false;
  let opened = false;
  let failure: unknown;
  const close = () => { if (opened && !closed) { closed = true; Browser.dismissAuthSession(); } };
  signal.addEventListener('abort', close);
  try {
    const result = await browserFlow(async () => { const flow = await api.startDeletion(token, provider); flowId = flow.flowId; return flow; },
      async id => (await api.deletionStatus(provider, id)) === 'deleted' || null, signal, {
        open: url => {
          opened = true;
          void Browser.openAuthSessionAsync(url, 'vibyra://auth-complete').then(() => { closed = true; })
            .catch(error => { failure = error; closed = true; });
        },
        closed: () => { if (failure) throw new Error('The browser could not open. Please try again.'); return closed; },
        close,
      }, 'This deletion attempt expired. Please try again.');
    return result === true || await finishedAnyway(api, provider, flowId, signal);
  } finally { signal.removeEventListener('abort', close); }
}
