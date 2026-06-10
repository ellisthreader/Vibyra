const desktopVoiceOptions = [
  { key: "alloy", label: "Alloy - neutral, balanced, versatile" },
  { key: "ash", label: "Ash - clear, conversational, confident" },
  { key: "ballad", label: "Ballad - warm, expressive, reflective" },
  { key: "coral", label: "Coral - bright, friendly, engaging" },
  { key: "echo", label: "Echo - smooth, measured, informative" },
  { key: "fable", label: "Fable - animated, warm, storytelling" },
  { key: "nova", label: "Nova - energetic, upbeat, approachable" },
  { key: "onyx", label: "Onyx - deep, steady, authoritative" },
  { key: "sage", label: "Sage - calm, thoughtful, reassuring" },
  { key: "shimmer", label: "Shimmer - soft, clear, optimistic" },
  { key: "verse", label: "Verse - dynamic, natural, expressive" },
  { key: "marin", label: "Marin - natural, warm, conversational" },
  { key: "cedar", label: "Cedar - rich, grounded, composed" }
];

function normalizeDesktopVoice(value) {
  const voice = String(value || "").toLowerCase();
  return desktopVoiceOptions.some((item) => item.key === voice) ? voice : "marin";
}

function normalizeDesktopVoiceSpeed(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed)) return 1;
  return Math.min(4, Math.max(0.25, Math.round(speed * 20) / 20));
}

function desktopVoicePreferences(prefs = desktopPreferences()) {
  return {
    speed: normalizeDesktopVoiceSpeed(prefs.voiceSpeed),
    voice: normalizeDesktopVoice(prefs.voice)
  };
}

function setDesktopVoicePreference(prefs, key, value) {
  if (key === "voice") prefs.voice = normalizeDesktopVoice(value);
  if (key === "voiceSpeed") prefs.voiceSpeed = normalizeDesktopVoiceSpeed(value);
}

function profileVoiceSettingsPanel(prefs) {
  const settings = desktopVoicePreferences(prefs);
  const speed = settings.speed.toFixed(2);
  return `<section class="profile-choice-list profile-settings-list profile-voice-settings">
    <h2>Voice</h2>
    ${profileSelectRow("OpenAI voice", "voice", desktopVoiceOptions, settings.voice)}
    <div class="profile-voice-speed-row">
      <span class="profile-voice-speed-copy"><strong>Speaking speed</strong><small>Used for OpenAI and system fallback audio.</small></span>
      <div class="profile-voice-speed-controls">
        <button type="button" data-profile-action="adjust-voice-speed" data-profile-value="-0.25" aria-label="Decrease speaking speed">-</button>
        <output data-profile-voice-speed-output>${escapeHtml(speed)}x</output>
        <button type="button" data-profile-action="adjust-voice-speed" data-profile-value="0.25" aria-label="Increase speaking speed">+</button>
      </div>
      <input type="range" min="0.25" max="4" step="0.05" value="${escapeAttribute(String(settings.speed))}"
        data-profile-select="voiceSpeed" aria-label="Speaking speed from 0.25 to 4 times normal" />
    </div>
  </section>`;
}

function adjustDesktopVoiceSpeed(value) {
  const prefs = desktopPreferences();
  prefs.voiceSpeed = normalizeDesktopVoiceSpeed(Number(prefs.voiceSpeed) + Number(value || 0));
  saveDesktopPreferences(prefs);
  syncProfilePreferenceControls("voiceSpeed", prefs);
}
