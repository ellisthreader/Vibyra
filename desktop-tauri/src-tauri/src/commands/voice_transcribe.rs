//! Turning recorded speech into text: which model hears it, what language it
//! is told to expect, and the one call that does it. Split from `voice.rs`,
//! which owns the microphone — together they crossed the 200-line limit, and
//! apart each file is one thing.

use base64::Engine;
use serde::Deserialize;

pub const VOICE_MODEL: &str = "whisper-1";

/// An ISO-639-1 code or nothing. Whisper takes a two-letter code and silently
/// falls back to guessing on anything else, so a malformed value is dropped
/// here rather than sent and quietly ignored.
pub(super) fn resolve_language(language: Option<String>) -> Option<String> {
    language
        .map(|value| value.trim().to_lowercase())
        .filter(|value| value.len() == 2 && value.chars().all(|c| c.is_ascii_lowercase()))
}

pub(super) async fn transcribe(
    wav: Vec<u8>,
    token: String,
    language: Option<String>,
) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Transcription {
        text: String,
    }

    let mut body =
        serde_json::json!({ "audio": base64::engine::general_purpose::STANDARD.encode(wav) });
    // Telling Whisper what to expect is both faster and more accurate than
    // letting it detect; it is also what stops it translating a reply into
    // English when it mishears the language.
    if let Some(language) = language {
        body["language"] = serde_json::Value::String(language);
    }

    let response = crate::assistant_api::post("transcriptions", &token, body).await?;
    let parsed: Transcription = response
        .json()
        .await
        .map_err(|_| "Vibyra could not read the transcription.".to_string())?;
    Ok(parsed.text)
}

#[cfg(test)]
mod tests {
    use super::resolve_language;

    #[test]
    fn only_a_real_two_letter_code_reaches_the_service() {
        assert_eq!(resolve_language(Some("en".into())), Some("en".into()));
        assert_eq!(resolve_language(Some(" FR ".into())), Some("fr".into()));
        // Whisper answers a full language name by silently guessing instead,
        // which looks like the setting doing nothing. Drop it here so the
        // request is honestly "detect" rather than quietly ignored.
        assert_eq!(resolve_language(Some("English".into())), None);
        assert_eq!(resolve_language(Some("e1".into())), None);
        assert_eq!(resolve_language(Some(String::new())), None);
        assert_eq!(resolve_language(None), None);
    }
}
