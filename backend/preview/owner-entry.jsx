import React from "react";
import { createRoot } from "react-dom/client";
import PortalApp from "../resources/js/portal/PortalApp.jsx";
import "../resources/css/portal.css";
createRoot(document.getElementById("portal-root")).render(<PortalApp />);
