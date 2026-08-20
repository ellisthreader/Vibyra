import { useEffect, useRef, useState } from "react";

import posterUrl from "../../assets/auth-space-loop-poster.webp";
import videoUrl from "../../assets/auth-space-loop.mp4";

function reducedMotionEnabled() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AuthBackdrop() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(reducedMotionEnabled);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = () => {
      const reduce = preference.matches;
      const video = videoRef.current;
      setReducedMotion(reduce);
      if (!video) return;
      if (reduce) {
        video.pause();
        video.currentTime = 0;
        setReady(false);
        return;
      }
      void video.play().catch(() => setReady(false));
    };

    syncPlayback();
    preference.addEventListener("change", syncPlayback);
    return () => preference.removeEventListener("change", syncPlayback);
  }, [reducedMotion]);

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
          onPlaying={() => setReady(true)}
          onError={() => setReady(false)}
        />
      )}
    </>
  );
}
