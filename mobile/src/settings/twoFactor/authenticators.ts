import { Linking } from 'react-native';

export interface Authenticator {
  id: string;
  name: string;
  scheme: string;
}

/**
 * The authenticator apps this phone can be asked about by name, so the button can say
 * "Set up in 1Password" rather than something vaguer. Each scheme is also listed in
 * `app.config.ts` under `LSApplicationQueriesSchemes`: iOS answers "no" to any scheme
 * an app has not declared in advance, so a name missing from that list would read here
 * as an app that is not installed.
 *
 * Being absent from this list costs an app nothing. Every authenticator worth the name
 * handles `otpauth://` itself, and that link is what is actually opened either way —
 * the names only decide what the button is allowed to call the app it will open.
 */
const known: Authenticator[] = [
  { id: 'onepassword', name: '1Password', scheme: 'onepassword://' },
  { id: 'bitwarden', name: 'Bitwarden', scheme: 'bitwarden://' },
  { id: 'authy', name: 'Authy', scheme: 'authy://' },
  { id: 'microsoft', name: 'Microsoft Authenticator', scheme: 'msauth://' },
  { id: 'twofas', name: '2FAS', scheme: 'twofas://' },
  { id: 'ente', name: 'Ente Auth', scheme: 'enteauth://' },
  { id: 'raivo', name: 'Raivo OTP', scheme: 'raivo-otp://' },
  { id: 'aegis', name: 'Aegis', scheme: 'aegis://' },
];
/** Any app at all that has claimed one-time passwords, named or not. */
const anyAuthenticator: Authenticator = {
  id: 'any',
  name: 'your authenticator app',
  scheme: 'otpauth://',
};

const opens = async (scheme: string) => {
  try {
    return await Linking.canOpenURL(scheme);
  } catch {
    return false;
  }
};

/**
 * Which authenticators this phone has, best first. The list is for naming a button,
 * never for gating one: an empty answer means "nothing recognised", which on iOS also
 * covers the built-in Passwords app, so the offer to open one is made regardless.
 */
export async function installedAuthenticators(): Promise<Authenticator[]> {
  const found = await Promise.all(
    known.map(async (app) => ((await opens(app.scheme)) ? app : null)),
  );
  const named = found.filter((app): app is Authenticator => app !== null);
  if (named.length) return named;

  return (await opens(anyAuthenticator.scheme)) ? [anyAuthenticator] : [];
}

/**
 * Hands the setup link to whichever app claims it, which fills the account in rather
 * than leaving anyone to type a 32-character secret. False when the phone has nothing
 * to open it with — the page then leans on the code and the key, which always work.
 */
export async function openSetupLink(uri: string): Promise<boolean> {
  try {
    await Linking.openURL(uri);
    return true;
  } catch {
    return false;
  }
}
