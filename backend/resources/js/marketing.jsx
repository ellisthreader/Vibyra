import React from "react";
import { createRoot } from "react-dom/client";
import "../css/marketing.css";
import App from "./marketing/App.jsx";
import { initAnalyticsChoice } from "./analyticsChoice.js";

createRoot(document.getElementById("marketing-root")).render(<App />);
initAnalyticsChoice();
