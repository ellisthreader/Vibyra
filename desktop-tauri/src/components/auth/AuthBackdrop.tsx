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

export function AuthBackdrop() {
  const [reducedMotion, setReducedMotion] = useState(reducedMotionEnabled);
  // The in-app toggle counts too: skipping the video also skips parsing its
  // multi-megabyte chunk, which is the point of the setting on a slow machine.
  const reduceMotionSetting = useSettingsStore((state) => Boolean(state.settings?.reduceMotion));

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
      {!reducedMotion && !reduceMotionSetting && (
        <Suspense fallback={null}>
          <AuthBackdropVideo posterUrl={posterUrl} />
        </Suspense>
      )}
    </>
  );
}
