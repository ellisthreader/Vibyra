import React from "react";
import useReleaseCatalog from "../../marketing/downloads/useReleaseCatalog.js";
import { available, fileUrl } from "../../marketing/downloads/catalog.js";
import { formatBytes, recommendedPlatform } from "../platform.js";

const platforms = [
  { key: "windows", name: "Windows", icon: "microsoft.svg", variants: [["windows", "Windows installer"]], install: "Open the downloaded .exe and follow the installer." },
  { key: "macos", name: "macOS", icon: "apple.svg", variants: [["macos-arm64", "Apple Silicon"], ["macos-x64", "Intel Mac"]], install: "Open the .dmg and drag Vibyra into Applications." },
  { key: "linux", name: "Linux", icon: "linux-tux.svg", variants: [["linux-deb", "Debian / Ubuntu"], ["linux", "AppImage"]], install: "Open the .deb in your software installer, or make the AppImage executable and launch it." },
];

export default function AccountDownloads() {
  const { catalog, error, retry } = useReleaseCatalog();
  const recommended = recommendedPlatform();
  const ordered = [...platforms].sort((a, b) => Number(b.key === recommended) - Number(a.key === recommended));
  return <section className="account-downloads" id="downloads" aria-labelledby="account-downloads-title">
    <div className="account-section-head"><div><span>02 / DOWNLOAD</span><h2 id="account-downloads-title">Bring your workspace to life.</h2><p>Choose the installer for your computer. Vibyra Desktop is free.</p></div><a href="/downloads">All downloads <span aria-hidden="true">↗</span></a></div>
    {error ? <div className="account-download-error" role="alert"><p>We couldn’t check the current installers.</p><button className="portal-button portal-button--secondary" onClick={retry}>Try again</button></div>
      : !catalog ? <p className="account-download-loading" role="status">Checking current releases…</p>
      : <div className="account-download-grid">{ordered.map((platform) => {
        const ready = platform.variants.filter(([key]) => available(catalog.releases[key]));
        return <article className="account-download-card" key={platform.key}>
          <div className="account-download-card-top"><img src={`/platform-icons/${platform.icon}`} alt="" width="31" height="31" /><span>{platform.key === recommended ? "YOUR COMPUTER" : "DESKTOP"}</span></div>
          <h3>{platform.name}</h3>
          {ready.length ? <div className="account-download-links">{ready.map(([key, label]) => {
            const release = catalog.releases[key];
            return <a href={fileUrl(catalog, key)} key={key} data-analytics-download={key}>
              <span><strong>{label}</strong><small>v{release.version} · {formatBytes(release.sizeBytes)}</small></span><span aria-hidden="true">↓</span>
            </a>;
          })}</div> : <p className="account-download-unavailable">{platform.key === "macos" ? "Public Mac installers are coming soon." : "Temporarily unavailable. Please check back."}</p>}
          {ready.length > 0 && <p className="account-download-install">{platform.install}</p>}
          {platform.key === "macos" && ready.some(([key]) => catalog.releases[key].notarized === false) && <a className="account-mac-help" href="https://support.apple.com/en-us/102445" target="_blank" rel="noreferrer">First launch on Mac ↗</a>}
        </article>;
      })}</div>}
    <p className="account-download-footnote">Already installed? Open Vibyra Desktop and sign in with <strong>this account</strong>.</p>
  </section>;
}
