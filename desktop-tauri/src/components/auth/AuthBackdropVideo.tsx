import { useCallback, useLayoutEffect, useRef, useState } from "react";

import videoUrl from "../../assets/auth-space-loop.webm?inline";

// The VP8 loop ships as a base64 `data:` URI on purpose: custom-protocol and Blob
// delivery stall or corrupt media range reads in WebKit/GStreamer on Linux
// production builds even when dev playback works (Desktop/Desktop Shell.md).
//
// That payload is ~1 MB of JavaScript, so this module is loaded lazily and
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
    if (!video || document.hidden || reducedMotionEnabled()) return;
    video.defaultMuted = true;
    video.muted = true;
    void video.play().catch(() => setReady(false));
  }, []);

  useLayoutEffect(() => {
    // Captured here, not read in the cleanup: React detaches refs before it
    // flushes an unmounting tree's effect cleanups, so `videoRef.current` is
    // already null by then and the teardown below would silently do nothing.
    const video = videoRef.current;
    const syncPlayback = () => {
      if (document.hidden) {
        video?.pause();
        return;
      }
      startPlayback();
    };
    syncPlayback();
    window.addEventListener("focus", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    return () => {
      window.removeEventListener("focus", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
      // Leaving signup unmounts this component, but detaching a playing element
      // does not stop WebKit's GStreamer pipeline: the old 1080p24 loop kept
      // decoding for the rest of the session, burning renderer CPU that the
      // terminals need to stay responsive. Dropping the source is what
      // actually tears the decoder down.
      if (!video) return;
      video.pause();
      video.removeAttribute("src");
      video.load();
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
