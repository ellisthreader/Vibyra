import type { EmailAuthMode } from "../../lib/accountPolicy";

interface AuthVideoState {
  emailOpen: boolean;
  emailMode: EmailAuthMode;
  recovering: boolean;
  restoring: boolean;
  connectionError: boolean;
  authorizing: boolean;
}

/** The decoder may exist only while the visible email surface is signup. */
export function authVideoEnabled(state: AuthVideoState): boolean {
  return (
    state.emailOpen &&
    state.emailMode === "signup" &&
    !state.recovering &&
    !state.restoring &&
    !state.connectionError &&
    !state.authorizing
  );
}
