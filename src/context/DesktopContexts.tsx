import React, { createContext, PropsWithChildren, useCallback, useContext, useMemo, useRef } from "react";
import type { AppContextValue } from "./appContextTypes";

type DesktopConnectionValue = Pick<AppContextValue,
  "paired" | "agentUrl" | "pairCode" | "pairing" | "pairingError" | "pairingMessage" |
  "healthMessage" | "checkingHealth" | "pendingPhoneApproval" | "connection" |
  "rememberedDesktops" | "machineName"
>;
type DesktopActionsValue = Pick<AppContextValue,
  "confirmPhonePermission" | "discoverPairableDesktops" | "connectRememberedDesktop" |
  "disconnectDesktop" | "pairMachine" | "pairMachineAt" | "testDesktopConnection" |
  "setAgentUrl" | "setPairCode"
>;
type DesktopPermissionValue = {
  editApprovals: AppContextValue["editApprovals"];
  setProjectEditPermission: (projectId: string | undefined, mode: "ask" | "always") => void;
};

const DesktopConnectionContext = createContext<DesktopConnectionValue | null>(null);
const DesktopActionsContext = createContext<DesktopActionsValue | null>(null);
const DesktopPermissionContext = createContext<DesktopPermissionValue | null>(null);

export function DesktopContextProviders({ app, children }: PropsWithChildren<{ app: AppContextValue }>) {
  const connection = useMemo<DesktopConnectionValue>(() => ({
    paired: app.paired, agentUrl: app.agentUrl, pairCode: app.pairCode, pairing: app.pairing,
    pairingError: app.pairingError, pairingMessage: app.pairingMessage, healthMessage: app.healthMessage,
    checkingHealth: app.checkingHealth, pendingPhoneApproval: app.pendingPhoneApproval,
    connection: app.connection, rememberedDesktops: app.rememberedDesktops, machineName: app.machineName
  }), [app.paired, app.agentUrl, app.pairCode, app.pairing, app.pairingError, app.pairingMessage,
    app.healthMessage, app.checkingHealth, app.pendingPhoneApproval, app.connection,
    app.rememberedDesktops, app.machineName]);
  const actions: DesktopActionsValue = {
    confirmPhonePermission: useStableAction(app.confirmPhonePermission),
    discoverPairableDesktops: useStableAction(app.discoverPairableDesktops),
    connectRememberedDesktop: useStableAction(app.connectRememberedDesktop),
    disconnectDesktop: useStableAction(app.disconnectDesktop), pairMachine: useStableAction(app.pairMachine),
    pairMachineAt: useStableAction(app.pairMachineAt), testDesktopConnection: useStableAction(app.testDesktopConnection),
    setAgentUrl: useStableAction(app.setAgentUrl), setPairCode: useStableAction(app.setPairCode)
  };
  const stableActions = useMemo(() => actions, Object.values(actions));
  const setPermission = useStableAction(app.setDesktopPermissionMode);
  const setProjectEditPermission = useCallback((projectId: string | undefined, mode: "ask" | "always") => {
    if (mode === "always" && !projectId) return;
    setPermission(mode === "always" ? "auto" : "ask", projectId);
  }, [setPermission]);
  const permissions = useMemo<DesktopPermissionValue>(() => ({
    editApprovals: app.editApprovals, setProjectEditPermission
  }), [app.editApprovals, setProjectEditPermission]);
  return <DesktopConnectionContext.Provider value={connection}><DesktopActionsContext.Provider value={stableActions}>
    <DesktopPermissionContext.Provider value={permissions}>{children}</DesktopPermissionContext.Provider>
  </DesktopActionsContext.Provider></DesktopConnectionContext.Provider>;
}

function useStableAction<T extends (...args: never[]) => unknown>(action: T): T {
  const current = useRef(action);
  current.current = action;
  return useCallback(((...args: Parameters<T>) => current.current(...args)) as T, []);
}
function requiredContext<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} must be used inside AppProvider`);
  return value;
}
export const useDesktopConnection = () => requiredContext(useContext(DesktopConnectionContext), "useDesktopConnection");
export const useDesktopActions = () => requiredContext(useContext(DesktopActionsContext), "useDesktopActions");
export const useDesktopPermission = () => requiredContext(useContext(DesktopPermissionContext), "useDesktopPermission");
