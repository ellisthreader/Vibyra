import { lazy, Suspense, useEffect, useState } from "react";

import posterUrl from "../../assets/auth-space-loop-poster.webp";
import { useSettingsStore } from "../../state/settingsStore";

// The poster is a real emitted asset and paints immediately; the loop carries a
// multi-megabyte inlined payload, so it is code-split into its own chunk. See
// AuthBackdropVideo for why the video cannot be served as a plain asset.
const AuthBackdropVideo = lazy(() => import("./AuthBackdropVideo"));

function reducedMotionEnabled() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AuthBackdrop({ videoEnabled }: { videoEnabled: boolean }) {
  const [reducedMotion, setReducedMotion] = useState(reducedMotionEnabled);
  // The in-app toggle counts too: skipping the video also skips parsing its
  // media chunk, which is the point of the setting on a slow machine.
  // Maximum performance mode implies it for the same reason — the loop's h264
  // decode pipeline is exactly the kind of standing cost the mode exists to shed.
  const reduceMotionSetting = useSettingsStore(
    (state) => Boolean(state.settings?.reduceMotion) || state.settings?.performanceMode === "max",
  );

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(preference.matches);
    syncPreference();
    preference.addEventListener("change", syncPreference);
    return () => preference.removeEventListener("change", syncPreference);
  }, []);

  return (
    <>
      <img className="auth__backdrop auth__backdrop--poster" src={posterUrl} alt="" draggable={false} />
      {videoEnabled && !reducedMotion && !reduceMotionSetting && (
        <Suspense fallback={null}>
          <AuthBackdropVideo posterUrl={posterUrl} />
        </Suspense>
      )}
    </>
  );
}
