import { useCallback, useState } from "react";
import { usePreferences } from "../../../../context/PreferencesContext";
import { SheetKind } from "./types";

export function useProfileSheets() {
  const prefs = usePreferences();
  const [activeSheet, setActiveSheet] = useState<SheetKind | null>(null);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [agentNotifications, setAgentNotifications] = useState(true);
  const [biometricLock, setBiometricLock] = useState(false);
  const [analyticsOptIn, setAnalyticsOptIn] = useState(true);

  const open = useCallback((kind: SheetKind) => setActiveSheet(kind), []);
  const close = useCallback(() => setActiveSheet(null), []);
  const isOpen = useCallback((kind: SheetKind) => activeSheet === kind, [activeSheet]);

  return {
    open, close, isOpen, setActiveSheet,
    language: prefs.language,
    setLanguage: prefs.setLanguage,
    appearance: prefs.appearance,
    setAppearance: prefs.setAppearance,
    effectiveScheme: prefs.effectiveScheme,
    pushNotifications, setPushNotifications,
    emailNotifications, setEmailNotifications,
    agentNotifications, setAgentNotifications,
    biometricLock, setBiometricLock,
    analyticsOptIn, setAnalyticsOptIn
  };
}

export type ProfileSheets = ReturnType<typeof useProfileSheets>;
