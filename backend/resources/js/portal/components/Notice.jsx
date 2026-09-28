import React from "react";

export default function Notice({ tone = "neutral", children }) {
  return <div className={`portal-notice portal-notice--${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}
