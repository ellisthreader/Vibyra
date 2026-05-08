import { useCallback, useState } from "react";
import { AppearanceMode, SheetKind } from "./types";

export function useProfileSheets() {
  const [activeSheet, setActiveSheet] = useState<SheetKind | null>(null);
  const [language, setLanguage] = useState("English");
  const [appearance, setAppearance] = useState<AppearanceMode>("dark");
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
    language, setLanguage,
    appearance, setAppearance,
    pushNotifications, setPushNotifications,
    emailNotifications, setEmailNotifications,
    agentNotifications, setAgentNotifications,
    biometricLock, setBiometricLock,
    analyticsOptIn, setAnalyticsOptIn
  };
}

export type ProfileSheets = ReturnType<typeof useProfileSheets>;
