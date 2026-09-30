import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, portalApi } from "../api.js";

const WebsiteSessionContext = createContext(null);

export function WebsiteSessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const payload = await portalApi.session();
      setUser(payload.user ?? null);
      return payload.user ?? null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        return null;
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  // A login either signs in or comes back asking for a code. The caller is handed
  // the challenge rather than an error, because nothing has gone wrong: the password
  // was right and the account simply asks a second question.
  const login = useCallback(async (fields) => {
    const payload = await portalApi.login(fields);
    if (payload.twoFactor?.challengeId) return { twoFactor: payload.twoFactor };
    setUser(payload.user ?? null);
    return { user: payload.user ?? null };
  }, []);

  const loginTwoFactor = useCallback(async (challengeId, code) => {
    const payload = await portalApi.loginTwoFactor(challengeId, code);
    setUser(payload.user ?? null);
    return payload.user;
  }, []);

  const signup = useCallback(async (fields) => {
    const payload = await portalApi.signup(fields);
    setUser(payload.user ?? null);
    return payload.user;
  }, []);

  const logout = useCallback(async () => {
    await portalApi.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, refresh, login, loginTwoFactor, signup, logout }), [
    user, loading, refresh, login, loginTwoFactor, signup, logout,
  ]);
  return <WebsiteSessionContext.Provider value={value}>{children}</WebsiteSessionContext.Provider>;
}

export function useWebsiteSession() {
  const value = useContext(WebsiteSessionContext);
  if (!value) throw new Error("useWebsiteSession must be used inside WebsiteSessionProvider");
  return value;
}
