import { useCallback, useEffect, useRef, useState } from "react";

import posterUrl from "../../assets/auth-space-loop-poster.webp";
import videoUrl from "../../assets/auth-space-loop.mp4?inline";

function reducedMotionEnabled() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AuthBackdrop() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(reducedMotionEnabled);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => {
      if (preference.matches) setReady(false);
      setReducedMotion(preference.matches);
    };
    syncPreference();
    preference.addEventListener("change", syncPreference);
    return () => preference.removeEventListener("change", syncPreference);
  }, []);

  const startPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || reducedMotion) return;
    video.defaultMuted = true;
    video.muted = true;
    void video.play().catch(() => setReady(false));
  }, [reducedMotion]);

  useEffect(() => {
    const resume = () => {
      if (!document.hidden) startPlayback();
    };
    resume();
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [startPlayback]);

  return (
    <>
      <img className="auth__backdrop auth__backdrop--poster" src={posterUrl} alt="" draggable={false} />
      {!reducedMotion && (
        <video
          ref={videoRef}
          className={`auth__backdrop auth__backdrop--video ${ready ? "is-ready" : ""}`}
          src={videoUrl}
          poster={posterUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          disablePictureInPicture
          disableRemotePlayback
          onCanPlay={startPlayback}
          onPlaying={() => setReady(true)}
          onError={() => setReady(false)}
        />
      )}
    </>
  );
}
