import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { trustedDesktopUrl } from "../utils/desktopUrls";

export type PairingDeepLink = { code: string; url: string };

export function parsePairingDeepLink(value: string): PairingDeepLink | null {
  try {
    const link = new URL(value);
    if (link.protocol !== "vibyra:" || link.hostname !== "pair") return null;
    const code = String(link.searchParams.get("code") || "").trim().toUpperCase();
    const url = trustedDesktopUrl(String(link.searchParams.get("url") || ""));
    if (!/^[A-Z2-9]{4,12}$/.test(code) || !url) return null;
    return { code, url };
  } catch {
    return null;
  }
}

export function usePairingDeepLink({
  accountId,
  pairMachineAt,
  setAgentUrl,
  setPairCode,
  setPairingMessage
}: {
  accountId: number | null;
  pairMachineAt: (url: string, code: string) => Promise<boolean>;
  setAgentUrl: (url: string) => void;
  setPairCode: (code: string) => void;
  setPairingMessage: (message: string) => void;
}) {
  const pending = useRef<PairingDeepLink | null>(null);
  const initialUrlLoaded = useRef(false);
  const [requestVersion, setRequestVersion] = useState(0);

  const receive = useCallback((value: string | null) => {
    const parsed = value ? parsePairingDeepLink(value) : null;
    if (!parsed) return;
    pending.current = parsed;
    setAgentUrl(parsed.url);
    setPairCode(parsed.code);
    setPairingMessage(accountId
      ? "Opening the secure pairing request..."
      : "Sign in to Vibyra to finish pairing this desktop.");
    setRequestVersion((current) => current + 1);
  }, [accountId, setAgentUrl, setPairCode, setPairingMessage]);

  useEffect(() => {
    if (!initialUrlLoaded.current) {
      initialUrlLoaded.current = true;
      void Linking.getInitialURL().then(receive);
    }
    const subscription = Linking.addEventListener("url", (event) => receive(event.url));
    return () => subscription.remove();
  }, [receive]);

  useEffect(() => {
    if (!accountId || !pending.current) return;
    const request = pending.current;
    pending.current = null;
    void pairMachineAt(request.url, request.code);
  }, [accountId, pairMachineAt, requestVersion]);
}
