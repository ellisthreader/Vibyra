import { useEffect } from "react";

import { useNotificationStore, setFocusProbe, setOsEscalator } from "../state/notificationStore";
import { useNotificationPrefs } from "../state/settingsStore";
import { primeAudio, setAudioPrimerRearm } from "./notificationSounds";
import { raiseOsNotification, refreshOsPermission } from "./osNotifications";
import { usePerfWatch } from "./usePerfWatch";
import { useUpdateNotifications } from "./useUpdateNotifications";
import { startFocusTracking, windowIsFocused } from "./windowFocus";

/** Wires the store's injectable hooks once. Module scope, not an effect: the
 * store is a singleton and re-registering on every mount would be pointless
 * churn. */
function connectStore(): void {
  setFocusProbe(windowIsFocused);
  setOsEscalator((item) => {
    void raiseOsNotification(item);
  });
}

/**
 * WebKit creates an AudioContext suspended and silently ignores `resume()`
 * outside a user gesture — no error, the clock simply never starts. So the
 * first click or keypress of the session builds it.
 *
 * Capture phase is load-bearing: terminals swallow keydown in the bubble phase,
 * so a user who goes straight to typing would otherwise never prime audio.
 *
 * Re-armable, because the context is suspended again while idle — it costs a
 * GStreamer pull thread to leave running. If a build turns out not to honour
 * `resume()` outside a gesture, the sound engine says so and the next click
 * unlocks it again rather than the app going quietly mute.
 */
function usePrimedAudio(): void {
  useEffect(() => {
    let live = true;
    const prime = () => primeAudio();
    const options = { capture: true, once: true, passive: true } as const;
    const arm = () => {
      if (!live) return;
      document.addEventListener("pointerdown", prime, options);
      document.addEventListener("keydown", prime, options);
    };
    setAudioPrimerRearm(arm);
    arm();
    return () => {
      live = false;
      setAudioPrimerRearm(() => {});
      document.removeEventListener("pointerdown", prime, true);
      document.removeEventListener("keydown", prime, true);
    };
  }, []);
}

/** Toasts are about what just happened. Coming back to the window after an hour
 * away, a stack of stale cards is noise — but the unread count and the history
 * behind the bell both survive. */
function useFocusTracking(): void {
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void startFocusTracking((focused) => {
      if (focused) useNotificationStore.getState().dismissAllToasts();
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    void refreshOsPermission();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
}

/** Keeps the store's copy of the preferences in step with the settings file.
 * Pushed in rather than read out: the store may not import `settingsStore`. */
function usePrefsMirror(): void {
  const prefs = useNotificationPrefs();
  useEffect(() => {
    useNotificationStore.getState().setPrefs(prefs);
  }, [prefs]);
}

connectStore();

/** Everything the notification system needs running, in one call from the
 * workspace shell. */
export function useNotificationRuntime(): void {
  usePrefsMirror();
  useFocusTracking();
  usePrimedAudio();
  usePerfWatch();
  useUpdateNotifications();
}
