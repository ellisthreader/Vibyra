import React from "react";
import { createRoot } from "react-dom/client";
import "../css/portal.css";
import "../css/portal/owner-accounts.css";
import PortalApp from "./portal/PortalApp.jsx";
import { initAnalyticsChoice } from "./analyticsChoice.js";

createRoot(document.getElementById("portal-root")).render(<PortalApp />);
initAnalyticsChoice();
