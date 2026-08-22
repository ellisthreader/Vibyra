import React, { useEffect, useMemo, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import DownloadCard from "../components/DownloadCard.jsx";
import BetaBanner from "../components/BetaBanner.jsx";
import UpdatesItself from "../components/UpdatesItself.jsx";
import WhatsNew from "../components/WhatsNew.jsx";
import Notice from "../components/Notice.jsx";
import { portalApi } from "../api.js";
import { recommendedPlatform } from "../platform.js";

const PLATFORM_ORDER = ["windows", "linux", "macos"];

/** The newest version anything is actually being served at — the heading should
 * never advertise a version no platform has. */
function latestVersion(releases) {
  const versions = (releases ?? [])
    .filter((release) => release.available && release.version)
    .map((release) => release.version);
  return versions.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  ).at(-1) ?? "";
}

export default function DownloadsPage() {
  const [releases, setReleases] = useState(null);
  const [error, setError] = useState("");
  const recommended = useMemo(() => recommendedPlatform(), []);
  const order = useMemo(
    () => [...PLATFORM_ORDER].sort((a, b) => (b === recommended) - (a === recommended)),
    [recommended],
  );

  useEffect(() => {
    document.title = "Download Vibyra Desktop beta | Vibyra";
    portalApi.releases()
      .then((payload) => setReleases(payload.releases ?? []))
      .catch((caught) => setError(caught.message));
  }, []);

  const byPlatform = Object.fromEntries((releases ?? []).map((release) => [release.platform, release]));
  return (
    <PortalShell
      minimal
      eyebrow="First public beta"
      title="Vibyra Desktop"
      intro="Run Claude Code, Codex and Gemini side by side in a native terminal grid. Rebuilt from the ground up in Rust — fast, feather-light and truly native."
    >
      <div className="download-picker">
        <BetaBanner />
        <UpdatesItself />

        <section aria-labelledby="get-vibyra-title">
          <h2 id="get-vibyra-title" className="download-stack__title">Get Vibyra</h2>
          {error && <Notice tone="error">{error}</Notice>}
          {!releases && !error && <div className="download-loading" role="status">Loading downloads…</div>}
          {releases && <div className="download-stack">
            {order.map((platform) => <DownloadCard
              key={platform}
              platform={platform}
              release={byPlatform[platform]}
              debRelease={platform === "linux" ? byPlatform["linux-deb"] : undefined}
              recommended={recommended === platform}
            />)}
          </div>}
        </section>

        <WhatsNew version={latestVersion(releases)} />
      </div>
    </PortalShell>
  );
}
