import { useState } from "react";
import type { DesktopPermissionMode } from "../types/domain";
import { getDefaultAgentUrl } from "../utils/network";
import type { PersistedSession } from "../utils/persistence";
import type { AppState } from "./appStateTypes";
import type { getPersistedAppState } from "./appStatePersistence";

export function useDesktopState(session: PersistedSession, app: ReturnType<typeof getPersistedAppState>) {
  const [paired, setPaired] = useState(false);
  const [agentUrl, setAgentUrl] = useState(getDefaultAgentUrl);
  const [pairCode, setPairCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [pairingMessage, setPairingMessage] = useState("Open Vibyra Desktop and type the code shown there.");
  const [healthMessage, setHealthMessage] = useState("");
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [pendingPhoneApproval, setPendingPhoneApproval] = useState<AppState["pendingPhoneApproval"]>(null);
  const [connection, setConnection] = useState<AppState["connection"]>(null);
  const [desktopPermissionMode, setDesktopPermissionMode] = useState<DesktopPermissionMode>(app.desktopPermissionMode);
  const [rememberedDesktops, setRememberedDesktops] = useState<AppState["rememberedDesktops"]>(session.rememberedDesktops);
  const [machineName, setMachineName] = useState("Vibyra Desktop");
  return {
    state: { paired, agentUrl, pairCode, pairing, pairingError, pairingMessage, healthMessage, checkingHealth,
      pendingPhoneApproval, connection, desktopPermissionMode, rememberedDesktops, machineName },
    setters: { setPaired, setAgentUrl, setPairCode, setPairing, setPairingError, setPairingMessage, setHealthMessage,
      setCheckingHealth, setPendingPhoneApproval, setConnection, setDesktopPermissionMode, setRememberedDesktops, setMachineName }
  };
}
