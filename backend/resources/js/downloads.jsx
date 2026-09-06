import React from "react";
import { createRoot } from "react-dom/client";
import "../css/marketing.css";
import "../css/downloads.css";
import DownloadsPage from "./marketing/downloads/DownloadsPage.jsx";

createRoot(document.getElementById("marketing-root")).render(<DownloadsPage />);
