import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { usePreferences } from "../../../../context/PreferencesContext";
import { SheetKind } from "./types";

export function useProfileSheets(initialSheet: SheetKind | null = null, requestId = 0) {
  const prefs = usePreferences();
  const lastRequestId = useRef(requestId);
  const [activeSheet, setActiveSheet] = useState<SheetKind | null>(initialSheet);

  useLayoutEffect(() => {
    if (lastRequestId.current === requestId) return;
    lastRequestId.current = requestId;
    setActiveSheet(initialSheet);
  }, [initialSheet, requestId]);

  const open = useCallback((kind: SheetKind) => setActiveSheet(kind), []);
  const close = useCallback(() => setActiveSheet(null), []);
  const isOpen = useCallback((kind: SheetKind) => activeSheet === kind, [activeSheet]);

  return {
    open, close, isOpen, setActiveSheet,
    language: prefs.language,
    setLanguage: prefs.setLanguage,
    appearance: prefs.appearance,
    setAppearance: prefs.setAppearance,
    effectiveScheme: prefs.effectiveScheme
  };
}

export type ProfileSheets = ReturnType<typeof useProfileSheets>;
