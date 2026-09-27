import React from "react";
import { createRoot } from "react-dom/client";
import "../css/marketing.css";
import "../css/benchmarks.css";
import BenchmarksPage from "./marketing/benchmarks/BenchmarksPage.jsx";
import { initAnalyticsChoice } from "./analyticsChoice.js";

createRoot(document.getElementById("marketing-root")).render(<BenchmarksPage />);
initAnalyticsChoice();
