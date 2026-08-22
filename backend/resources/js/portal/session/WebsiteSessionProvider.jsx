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

  const login = useCallback(async (fields) => {
    const payload = await portalApi.login(fields);
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

  const value = useMemo(() => ({ user, loading, refresh, login, signup, logout }), [
    user, loading, refresh, login, signup, logout,
  ]);
  return <WebsiteSessionContext.Provider value={value}>{children}</WebsiteSessionContext.Provider>;
}

export function useWebsiteSession() {
  const value = useContext(WebsiteSessionContext);
  if (!value) throw new Error("useWebsiteSession must be used inside WebsiteSessionProvider");
  return value;
}
