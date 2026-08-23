import { lazy, Suspense, useEffect, useState } from "react";

import posterUrl from "../../assets/auth-space-loop-poster.webp";

// The poster is a real emitted asset and paints immediately; the loop carries a
// multi-megabyte inlined payload, so it is code-split into its own chunk. See
// AuthBackdropVideo for why the video cannot be served as a plain asset.
const AuthBackdropVideo = lazy(() => import("./AuthBackdropVideo"));

function reducedMotionEnabled() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AuthBackdrop() {
  const [reducedMotion, setReducedMotion] = useState(reducedMotionEnabled);

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
      {!reducedMotion && (
        <Suspense fallback={null}>
          <AuthBackdropVideo posterUrl={posterUrl} />
        </Suspense>
      )}
    </>
  );
}
