import React from "react";
import { WebsiteSessionProvider } from "./session/WebsiteSessionProvider.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import BillingPage from "./pages/BillingPage.jsx";
import BillingStatusPage from "./pages/BillingStatusPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import DownloadsPage from "./pages/DownloadsPage.jsx";

function PortalRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/login") return <AuthPage mode="login" />;
  if (path === "/signup") return <AuthPage mode="signup" />;
  if (path === "/billing/success") return <BillingStatusPage status="success" />;
  if (path === "/billing/cancel") return <BillingStatusPage status="cancel" />;
  if (path === "/billing") return <BillingPage />;
  if (path === "/downloads" || path === "/account/downloads") return <DownloadsPage />;
  return <AccountPage />;
}

export default function PortalApp() {
  return <WebsiteSessionProvider><PortalRoute /></WebsiteSessionProvider>;
}
