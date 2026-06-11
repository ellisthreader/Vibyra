function syncProfilePreferenceControls(key, prefs = desktopPreferences()) {
  const root = profileRenderTarget();
  if (!root) return;
  if (key === "appearance") {
    root.querySelectorAll('[data-profile-key="appearance"]').forEach((button) => {
      const active = button.dataset.profileValue === prefs.appearance;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
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
}
