//! Turning a reply into audio: which voices Vibyra offers, and the one call
//! that fetches the sound. Split from `speech.rs`, which owns playing it —
//! together they crossed the 200-line limit, and apart each file is one thing.

/// The model and the voices it offers. A fixed list, so a request cannot reach
/// for a different model by putting its name in the voice field.
pub const SPEECH_MODEL: &str = "gpt-4o-mini-tts";
pub const SPEECH_VOICES: [&str; 11] = [
    "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse",
];
pub const DEFAULT_SPEECH_VOICE: &str = "alloy";
// ALSA's aplay reads PCM containers, not MP3. Mac keeps its released format.
pub(super) const AUDIO_FORMAT: &str = if cfg!(target_os = "linux") {
    "wav"
} else {
    "mp3"
};

/// One voice this build can speak in.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechVoice {
    pub id: String,
    pub locale: String,
}

/// What Vibyra can speak with. The same list everywhere, because the voice is
/// part of the product rather than of whichever machine it runs on.
#[tauri::command]
pub async fn speech_voices() -> Result<Vec<SpeechVoice>, String> {
    Ok(SPEECH_VOICES
        .iter()
        .map(|id| SpeechVoice {
            id: (*id).to_string(),
            locale: "multilingual".to_string(),
        })
        .collect())
}

pub fn resolve_voice(voice: Option<String>) -> String {
    voice
        .map(|value| value.trim().to_lowercase())
        .filter(|value| SPEECH_VOICES.contains(&value.as_str()))
        .unwrap_or_else(|| DEFAULT_SPEECH_VOICE.to_string())
}

/// What the API accepts, and what is worth asking for. Below 0.5 the voice
/// slurs and above 2.0 it is not listenable, so the settings page offers less
/// than this; the clamp is here to keep a hand-edited settings.json in range.
pub const MIN_SPEECH_RATE: f32 = 0.25;
pub const MAX_SPEECH_RATE: f32 = 4.0;
/// Long enough for a sentence of direction, short enough that it cannot become
/// a second prompt smuggled into every spoken reply.
pub const MAX_STYLE_CHARS: usize = 240;

pub fn resolve_rate(rate: Option<f32>) -> f32 {
    rate.filter(|value| value.is_finite())
        .map(|value| value.clamp(MIN_SPEECH_RATE, MAX_SPEECH_RATE))
        .unwrap_or(1.0)
}

/// The spoken-delivery direction, flattened to one line. `gpt-4o-mini-tts`
/// takes its pace from `instructions` rather than from `speed` — the speed
/// field is documented but the model is widely reported to ignore it — so a
/// rate that is not 1.0 is also said in words here. Both are sent: whichever
/// one the model honours, the voice ends up at the pace that was asked for.
pub fn resolve_instructions(style: Option<String>, rate: f32) -> Option<String> {
    let style = style
        .map(|value| value.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(MAX_STYLE_CHARS).collect::<String>());
    let pace = match rate {
        r if r <= 0.85 => Some("Speak noticeably more slowly than you normally would."),
        r if r < 1.0 => Some("Speak a little more slowly than you normally would."),
        r if r >= 1.35 => Some("Speak noticeably faster than you normally would."),
        r if r > 1.0 => Some("Speak a little faster than you normally would."),
        _ => None,
    };
    match (style, pace) {
        (Some(style), Some(pace)) => Some(format!("{style} {pace}")),
        (Some(style), None) => Some(style),
        (None, Some(pace)) => Some(pace.to_string()),
        (None, None) => None,
    }
}

pub(super) async fn synthesize(
    key: &str,
    text: &str,
    voice: &str,
    rate: f32,
    instructions: Option<String>,
) -> Result<Vec<u8>, String> {
    let mut body = serde_json::json!({
        "model": SPEECH_MODEL,
        "voice": voice,
        "input": text,
        "response_format": AUDIO_FORMAT,
        "speed": rate,
    });
    if let Some(instructions) = instructions {
        body["instructions"] = serde_json::Value::String(instructions);
    }
    let response = crate::http_client::shared()
        .post("https://api.openai.com/v1/audio/speech")
        .bearer_auth(key.trim())
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|error| format!("Could not reach the speech service: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|value| value["error"]["message"].as_str().map(String::from))
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(detail);
    }

    let audio = response
        .bytes()
        .await
        .map_err(|error| format!("The spoken reply did not finish downloading: {error}"))?;
    if audio.is_empty() {
        return Err("The speech service returned no audio.".into());
    }
    Ok(audio.to_vec())
}
