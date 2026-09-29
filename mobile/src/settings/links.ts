import Constants from 'expo-constants';

/**
 * Every page the app sends people to outside itself, from the one site it already
 * talks to. `vibyra.app` is currently parked, so use the API site's legal routes
 * until the canonical domain is configured.
 */
const site = String(
  Constants.expoConfig?.extra?.apiUrl ?? 'https://vibyra-production.up.railway.app',
).replace(/\/+$/, '');
export const links = {
  terms: `${site}/legal/terms`,
  privacy: `${site}/legal/privacy`,
  dataRequests: `${site}/privacy/requests`,
  support: `${site}/privacy/requests?topic=support`,
  billing: `${site}/billing`,
  // The site has no help pages; its FAQ is the help there is.
  help: `${site}/#faq`,
};

/** The app's own version, and the build only when the native app actually reports one. */
export function appVersion() {
  const version = Constants.expoConfig?.version ?? '';
  const build = Constants.expoConfig?.ios?.buildNumber ?? null;
  return build ? `${version} (${build})` : version;
}
