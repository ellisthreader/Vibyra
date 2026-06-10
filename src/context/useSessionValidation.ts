import { useEffect, useRef } from "react";
import { appApiRequest, isAppSessionExpiredError, RemoteUser } from "../utils/appApi";
import { appDeviceName } from "../utils/deviceIdentity";

type SessionValidationOptions = {
  persistenceReady: boolean;
  authenticated: boolean;
  authToken: string;
  installId: string;
  applyRemoteUser: (user: RemoteUser) => void;
  expireSession: (message?: string) => void;
};

export function useSessionValidation(options: SessionValidationOptions) {
  const { persistenceReady, authenticated, authToken, installId, applyRemoteUser, expireSession } = options;
  const applyRemoteUserRef = useRef(applyRemoteUser);
  const expireSessionRef = useRef(expireSession);

  useEffect(() => {
    applyRemoteUserRef.current = applyRemoteUser;
    expireSessionRef.current = expireSession;
  }, [applyRemoteUser, expireSession]);

  useEffect(() => {
    if (!persistenceReady || !authenticated || !authToken) return;

    let cancelled = false;
    appApiRequest("/api/account/session/device", {
      method: "POST",
      body: JSON.stringify({ deviceName: appDeviceName(), installId })
    }, authToken).catch(() => {
      // Device metadata should not block session validation or app startup.
    });
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
  }, [authToken, authenticated, installId, persistenceReady]);
}
