import React from "react";
import { WebsiteSessionProvider } from "./session/WebsiteSessionProvider.jsx";
import RecoveryPage from "./pages/RecoveryPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import BillingPage from "./pages/BillingPage.jsx";
import BillingStatusPage from "./pages/BillingStatusPage.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import DeveloperPage from "./pages/DeveloperPage.jsx";
import OwnerPage from "./pages/OwnerPage.jsx";

function PortalRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/forgot-password") return <RecoveryPage />;
  if (path === "/reset-password") return <RecoveryPage reset />;
  if (path === "/login") return <AuthPage mode="login" />;
  if (path === "/owner/login") return <AuthPage mode="login" />;
  if (path === "/owner") return <OwnerPage />;
  if (path === "/signup") return <AuthPage mode="signup" />;
  if (path === "/billing/success") return <BillingStatusPage status="success" />;
  if (path === "/billing/cancel") return <BillingStatusPage status="cancel" />;
  if (path === "/billing") return <BillingPage />;
  if (path === "/account/developer") return <DeveloperPage />;
  if (path === "/checkout") return <CheckoutPage />;
  return <AccountPage />;
}

export default function PortalApp() {
  return <WebsiteSessionProvider><PortalRoute /></WebsiteSessionProvider>;
}
