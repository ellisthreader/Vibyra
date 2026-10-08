import { shortcutLabel } from "../../lib/hotkeys";
import { useSettingsStore } from "../../state/settingsStore";
import { CommitInput, Segmented } from "./SettingsControls";
import { SettingRow, type SettingsPaneProps } from "./SettingsShared";
import { SpeechVoiceRow } from "./SpeechVoiceRow";

/** Pace as a multiplier, the way a podcast app says it. Wider than this and
 * the voice stops being pleasant to listen to in either direction. */
const RATES = [
  { id: "0.75", label: "0.75×" },
  { id: "0.9", label: "0.9×" },
  { id: "1", label: "1×" },
  { id: "1.25", label: "1.25×" },
  { id: "1.5", label: "1.5×" },
];

/** Whisper wants ISO-639-1, and silently guesses on anything else. The list is
 * the languages it transcribes best, named as the people who speak them would
 * name them; anything unlisted still works under Detect automatically. */
const LANGUAGES = [
  { id: "", label: "Detect automatically" },
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "it", label: "Italiano" },
  { id: "pt", label: "Português" },
  { id: "nl", label: "Nederlands" },
  { id: "pl", label: "Polski" },
  { id: "ru", label: "Русский" },
  { id: "tr", label: "Türkçe" },
  { id: "hi", label: "हिन्दी" },
  { id: "zh", label: "中文" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
  { id: "ar", label: "العربية" },
];

const PAUSES = [
  { id: "700", label: "Short" },
  { id: "1100", label: "Normal" },
  { id: "1800", label: "Long" },
];

/** A settings.json edited by hand can hold any number; the page still has to
 * show one of its own choices, so it shows the nearest. */
function nearest(options: { id: string }[], value: number): string {
  return options.reduce((best, option) =>
    Math.abs(Number(option.id) - value) < Math.abs(Number(best.id) - value) ? option : best,
  ).id;
}

/**
 * Everything about how Vibyra sounds and how it hears you, in one place:
 * which voice answers, how fast and in what manner it reads, what language
 * your dictation is in, and how long a pause ends your turn.
 *
 * All four are parameters on calls the app already makes — nothing here starts
 * speaking or listening on its own.
 */
export function SettingsAdvancedVoice({ settings, update }: SettingsPaneProps) {
  const commit = useSettingsStore((state) => state.commit);
  const rate = settings.speechRate ?? 1;
  const pause = settings.talkPauseMs ?? 1_100;

  return (
    <div className="settings-group">
      <SpeechVoiceRow value={settings.speechVoice} onChange={(speechVoice) => void update({ speechVoice })} />

      <SettingRow label="Speaking speed" hint="How fast replies are read aloud.">
        <Segmented
          label="Speaking speed"
          value={nearest(RATES, rate)}
          options={RATES}
          onChange={(id) => void update({ speechRate: Number(id) })}
        />
      </SettingRow>

      <SettingRow
        label="Speaking style"
        hint="Optional. A short direction the voice follows — “warm and unhurried”, “brisk and factual”, “like a patient teacher”."
        stack
      >
        <CommitInput
          label="Speaking style"
          value={settings.speechStyle ?? ""}
          placeholder="Calm and matter-of-fact"
          onCommit={(speechStyle) => commit({ speechStyle: speechStyle.slice(0, 240) })}
        />
      </SettingRow>

      <SettingRow
        label="Voice typing language"
        hint="Naming the language you speak is faster and more accurate than letting Vibyra work it out, and stops it translating you into English."
      >
        <select
          className="input input--sm voice-language"
          aria-label="Voice typing language"
          value={settings.voiceLanguage ?? ""}
          onChange={(event) => void update({ voiceLanguage: event.target.value })}
        >
          {LANGUAGES.map((language) => (
            <option key={language.id || "auto"} value={language.id}>{language.label}</option>
          ))}
        </select>
      </SettingRow>

      <SettingRow
        label="Pause before it answers"
        hint={<>How long you can stop mid-sentence during <kbd className="kbd">{shortcutLabel(settings.talkShortcut)}</kbd> before Vibyra takes its turn.</>}
      >
        <Segmented
          label="Pause before it answers"
          value={nearest(PAUSES, pause)}
          options={PAUSES}
          onChange={(id) => void update({ talkPauseMs: Number(id) })}
        />
      </SettingRow>
    </div>
  );
}
