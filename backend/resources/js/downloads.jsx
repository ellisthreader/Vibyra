import React from "react";
import { createRoot } from "react-dom/client";
import "../css/marketing.css";
import "../css/downloads.css";
import DownloadsPage from "./marketing/downloads/DownloadsPage.jsx";
import { initAnalyticsChoice } from "./analyticsChoice.js";

createRoot(document.getElementById("marketing-root")).render(<DownloadsPage />);
initAnalyticsChoice();
