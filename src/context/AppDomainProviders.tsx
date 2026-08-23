import React, { PropsWithChildren } from "react";
import type { AppContextValue } from "./appContextTypes";
import { AccountContextProviders } from "./AccountContexts";
import { DesktopContextProviders } from "./DesktopContexts";

export function AppDomainProviders({ app, children }: PropsWithChildren<{ app: AppContextValue }>) {
  return <AccountContextProviders app={app}>
    <DesktopContextProviders app={app}>{children}</DesktopContextProviders>
  </AccountContextProviders>;
}
