import { computerName } from "../../lib/platform";
import { useEffect, useState } from "react";

import { speechVoices } from "../../ipc/tools";
import { startReplySpeech, stopReplySpeech } from "../../lib/speechPlayback";
import type { SpeechVoice } from "../../types";
import { SettingRow } from "./SettingsShared";

const SAMPLE = "This is how I will sound when we talk.";
const TEST_ID = "settings-voice-test";

/** Which voice Vibyra reads replies in, and a way to hear it.
 *
 * The test is the point of the row: "I cannot hear it" is otherwise impossible
 * to tell apart from a muted Mac, the wrong output device, or a key that
 * cannot reach the speech service. One press answers it, and says which.
 */
export function SpeechVoiceRow({ value, onChange }: { value: string; onChange: (voice: string) => void }) {
  const [voices, setVoices] = useState<SpeechVoice[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    speechVoices()
      .then((list) => { if (alive) setVoices(list); })
      .catch((problem) => { if (alive) { setVoices([]); setError(String(problem)); } });
    return () => { alive = false; void stopReplySpeech(TEST_ID).catch(() => {}); };
  }, []);

  const test = async () => {
    setError("");
    if (playing) {
      await stopReplySpeech(TEST_ID).catch(() => {});
      return setPlaying(false);
    }
    setPlaying(true);
    try {
      await startReplySpeech(TEST_ID, SAMPLE);
      // Synthesis and playback both happened if this resolved. How long the
      // audio runs is the speech service's business, so the button settles
      // back by itself rather than pretending to track it.
      setTimeout(() => setPlaying(false), 5_000);
    } catch (problem) {
      setError(String(problem));
      setPlaying(false);
    }
  };

  return (
    <SettingRow
      label="Spoken voice"
      hint={error || `Vibyra's own voices, not the ${computerName}'s. Test speaks at the speed and in the style set below.`}
    >
      <div className="speech-voice">
        <select
          className="input input--sm"
          aria-label="Spoken voice"
          value={value}
          disabled={!voices}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Vibyra default</option>
          {(voices ?? []).map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.id.charAt(0).toUpperCase() + voice.id.slice(1)}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn--compact speech-voice__test" onClick={() => void test()}>
          {playing ? "Stop" : "Test"}
        </button>
      </div>
    </SettingRow>
  );
}
