export const GUEST_TOKEN_KEY = 'vibes-guest-token';
export const GUEST_INSTALL_ID_KEY = 'vibes-install-id';
/** Where one identity's phone chat keeps its open chat, pending turn, model and effort. */
export const vibesStateKey = (identity: string | null) => `vibes.${encodeURIComponent(identity ?? 'guest')}`;
