export interface Authenticator { id: string; name: string; scheme: string }

/**
 * A browser has no app list to ask, and handing it an `otpauth://` link does nothing
 * visible. So the web says it has nothing, and the page leads with the QR code —
 * which is the right answer in a browser anyway, because the phone holding the
 * authenticator is a different device and can simply scan the screen.
 */
export const installedAuthenticators = async (): Promise<Authenticator[]> => [];
export const openSetupLink = async (): Promise<boolean> => false;
