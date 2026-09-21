import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Every page the app sends people to outside itself, from the one site it already
 * talks to. `vibyra.app` is a parked domain — every path redirects to a parking
 * page and it takes no mail — so links written against it were dead; the site the
 * API runs on serves the real legal pages, and follows the domain once it moves.
 */
const site = String(Constants.expoConfig?.extra?.apiUrl ?? 'https://vibyra-production.up.railway.app').replace(/\/+$/, '');
export const links = {
  terms: `${site}/legal/terms`,
  privacy: `${site}/legal/privacy`,
  // The site has no help pages; its FAQ is the help there is.
  help: `${site}/#faq`,
};
/** The address the legal pages publish. */
export const SUPPORT_EMAIL = 'support@vibyra.app';

/** The app's own version, and the build only when the native app actually reports one. */
export function appVersion() {
  const version = Constants.expoConfig?.version ?? '';
  const build = Constants.expoConfig?.ios?.buildNumber ?? null;
  return build ? `${version} (${build})` : version;
}

/**
 * A support email with what support will ask first already in it: the app, the
 * phone's system and whether a computer is connected. Nothing about the person —
 * they write that themselves.
 */
export function supportMail(connection: string) {
  const body = ['', '', '—', `Vibyra ${appVersion()}`, `${Platform.OS === 'ios' ? 'iOS' : Platform.OS} ${String(Platform.Version)}`,
    `Computer: ${connection}`].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Vibyra iPhone support')}&body=${encodeURIComponent(body)}`;
}
