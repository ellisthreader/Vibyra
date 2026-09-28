import React, { useState } from "react";
import PlatformRow from "./PlatformRow.jsx";
import { downloadPath } from "../api.js";
import { formatBytes } from "../platform.js";

function appImageCommand() {
  const origin = window.location.origin;
  return `curl -L -o ~/Vibyra.AppImage "${origin}/downloads/linux" && chmod +x ~/Vibyra.AppImage && ~/Vibyra.AppImage`;
}

function CommandLine({ command, label }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="command-line">
      <code>{command}</code>
      <button type="button" onClick={copy} aria-label={label}>{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}

export default function LinuxDownloadCard({ release, debRelease, recommended }) {
  const available = Boolean(release?.available);
  const debAvailable = Boolean(debRelease?.available);
  const meta = available || debAvailable
    ? [release?.version && `Beta ${release.version}`, "64-bit"].filter(Boolean).join(" · ")
    : "Release being prepared";
  return (
    <PlatformRow
      platform="linux"
      name="Linux"
      meta={meta}
      recommended={recommended}
      disabled={!available && !debAvailable}
      action={debAvailable && (
        <a className="platform-row__button" href={downloadPath("linux-deb")} aria-label="Download Vibyra .deb for Debian and Ubuntu">
          Download .deb <span aria-hidden="true">&darr;</span>
        </a>
      )}
    >
      {(available || debAvailable) && <div className="platform-row__install">
        {debAvailable && <>
          <p>
            <strong>Debian / Ubuntu / Mint</strong> — download the .deb ({formatBytes(debRelease.sizeBytes)}), then install it.
            Vibyra appears in your app launcher with its icon:
          </p>
          <CommandLine command={"sudo apt install ~/Downloads/Vibyra.deb"} label="Copy .deb install command" />
        </>}
        {available && <>
          <p><strong>Any other distro</strong> — one command downloads the AppImage and launches it:</p>
          <CommandLine command={appImageCommand()} label="Copy AppImage install command" />
        </>}
      </div>}
    </PlatformRow>
  );
}
