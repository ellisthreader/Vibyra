function syncProfilePreferenceControls(key, prefs = desktopPreferences()) {
  const root = profileRenderTarget();
  if (!root) return;
  if (key === "appearance") {
    renderProfile();
    return;
  }
  if (key === "language") {
    root.querySelectorAll('[data-profile-key="language"]').forEach((button) => {
      const active = button.dataset.profileValue === prefs.language;
      button.classList.toggle("active", active);
      const check = button.querySelector(".profile-choice-check");
      if (check) check.innerHTML = active ? icon("check") : "";
    });
    return;
  }
  if (key === "voiceSpeed") {
    const speed = normalizeDesktopVoiceSpeed(prefs.voiceSpeed);
    const range = root.querySelector('[data-profile-select="voiceSpeed"]');
    const output = root.querySelector("[data-profile-voice-speed-output]");
    if (range) range.value = String(speed);
    if (output) output.textContent = `${speed.toFixed(2)}x`;
    return;
  }
  if (key.startsWith("notifications.")) {
    const button = root.querySelector(`[data-profile-key="${CSS.escape(key)}"]`);
    button?.classList.toggle("is-on", Boolean(prefs.notifications[key.split(".")[1]]));
    return;
  }
  if (key === "improveVibyra" || key === "desktopLock") {
    root.querySelector(`[data-profile-key="${key}"]`)?.classList.toggle("is-on", Boolean(prefs[key]));
  }
}
