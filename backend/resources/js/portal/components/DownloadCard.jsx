import React from "react";
import PlatformRow from "./PlatformRow.jsx";
import LinuxDownloadCard from "./LinuxDownloadCard.jsx";
import MacDownloadCard from "./MacDownloadCard.jsx";
import { downloadPath } from "../api.js";
import { formatBytes } from "../platform.js";

export default function DownloadCard({ platform, release, debRelease, recommended }) {
  if (platform === "linux") return <LinuxDownloadCard release={release} debRelease={debRelease} recommended={recommended} />;
  if (platform === "macos") return <MacDownloadCard release={release} recommended={recommended} />;

  const available = Boolean(release?.available);
  const meta = available
    ? [release?.version && `Beta ${release.version}`, formatBytes(release?.sizeBytes), "Windows 10 or 11 · 64-bit"]
      .filter(Boolean).join(" · ")
    : "Release being prepared";
  return (
    <PlatformRow
      platform="windows"
      name="Windows"
      meta={meta}
      recommended={recommended}
      disabled={!available}
      action={available && (
        <a className="platform-row__button" href={downloadPath("windows")} aria-label="Download Vibyra for Windows">
          Download <span aria-hidden="true">&darr;</span>
        </a>
      )}
    />
  );
}
