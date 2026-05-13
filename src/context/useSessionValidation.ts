import { useEffect, useRef } from "react";
import { appApiRequest, isAppSessionExpiredError, RemoteUser } from "../utils/appApi";

type SessionValidationOptions = {
  persistenceReady: boolean;
  authenticated: boolean;
  authToken: string;
  applyRemoteUser: (user: RemoteUser) => void;
  expireSession: (message?: string) => void;
};

export function useSessionValidation(options: SessionValidationOptions) {
  const { persistenceReady, authenticated, authToken, applyRemoteUser, expireSession } = options;
  const applyRemoteUserRef = useRef(applyRemoteUser);
  const expireSessionRef = useRef(expireSession);

  useEffect(() => {
    applyRemoteUserRef.current = applyRemoteUser;
    expireSessionRef.current = expireSession;
  }, [applyRemoteUser, expireSession]);

  useEffect(() => {
    if (!persistenceReady || !authenticated || !authToken) return;

    let cancelled = false;
    appApiRequest<{ user?: RemoteUser }>("/api/session", undefined, authToken)
      .then((result) => {
        if (!cancelled && result.user) applyRemoteUserRef.current(result.user);
      })
      .catch((error: unknown) => {
        if (!cancelled && isAppSessionExpiredError(error)) {
          expireSessionRef.current("Your Vibyra login needs refreshing before AI chat can continue.");
        }
      });

    return () => { cancelled = true; };
  }, [authToken, authenticated, persistenceReady]);
}
