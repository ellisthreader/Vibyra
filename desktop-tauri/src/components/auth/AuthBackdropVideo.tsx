import { useCallback, useEffect, useRef, useState } from "react";

import videoUrl from "../../assets/auth-space-loop.mp4?inline";

// The loop ships as a base64 `data:` URI on purpose: custom-protocol and Blob
// delivery stall or corrupt media range reads in WebKit/GStreamer on Linux
// production builds even when dev playback works (Desktop/Desktop Shell.md).
//
// That payload is ~3.5 MB of JavaScript, so this module is loaded lazily and
// lands in its own chunk — the startup bundle no longer has to parse the video
// before the app can paint. AuthBackdrop's poster is the designed cover until
// `playing` fires, so nothing is visible during the extra hop.

function reducedMotionEnabled() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function AuthBackdropVideo({ posterUrl }: { posterUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  const startPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || reducedMotionEnabled()) return;
    video.defaultMuted = true;
    video.muted = true;
    void video.play().catch(() => setReady(false));
  }, []);

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
  );
}
