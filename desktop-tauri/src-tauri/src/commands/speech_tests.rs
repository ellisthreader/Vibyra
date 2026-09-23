use super::*;
use crate::commands::speech_synthesis::{speech_voices, DEFAULT_SPEECH_VOICE, SPEECH_VOICES};

#[test]
fn the_voice_is_one_of_ours_or_the_default() {
    assert_eq!(resolve_voice(Some("Nova".into())), "nova");
    assert_eq!(resolve_voice(Some("  shimmer ".into())), "shimmer");
    // Anything else — a model name, a system voice, empty — falls back rather
    // than travelling to the API as-is.
    assert_eq!(resolve_voice(Some("Samantha".into())), DEFAULT_SPEECH_VOICE);
    assert_eq!(resolve_voice(Some("gpt-4o".into())), DEFAULT_SPEECH_VOICE);
    assert_eq!(resolve_voice(Some(String::new())), DEFAULT_SPEECH_VOICE);
    assert_eq!(resolve_voice(None), DEFAULT_SPEECH_VOICE);
    assert!(SPEECH_VOICES.contains(&DEFAULT_SPEECH_VOICE));
}

#[tokio::test]
#[cfg(unix)]
async fn playback_ownership_and_cleanup_without_audio_hardware() {
    let child = std::process::Command::new("/bin/sleep")
        .arg("30")
        .spawn()
        .unwrap();
    let file = std::env::temp_dir().join("vibyra-speech-test.mp3");
    std::fs::write(&file, b"not really audio").unwrap();
    *PLAYBACK.lock() = Some(Playback {
        id: "current".into(),
        child,
        file: file.clone(),
    });
    speech_stop("previous".into()).await.unwrap();
    assert!(speech_active("current".into()).await.unwrap());
    assert!(!speech_active("previous".into()).await.unwrap());
    speech_stop("current".into()).await.unwrap();
    assert!(!speech_active("current".into()).await.unwrap());
    // Stopping takes the audio with it: a reply must not stay on disk.
    assert!(!file.exists());
}

#[tokio::test]
async fn every_voice_is_offered_and_none_of_them_is_a_system_voice() {
    let voices = speech_voices().await.unwrap();
    assert_eq!(voices.len(), SPEECH_VOICES.len());
    assert!(voices.iter().any(|voice| voice.id == "alloy"));
    assert!(!voices.iter().any(|voice| voice.id == "Samantha"));
}

#[test]
fn the_rate_is_clamped_to_what_the_api_accepts() {
    use crate::commands::speech_synthesis::{resolve_rate, MAX_SPEECH_RATE, MIN_SPEECH_RATE};
    assert_eq!(resolve_rate(Some(1.25)), 1.25);
    // A hand-edited settings.json cannot send a value the service rejects, and
    // cannot silence a reply by asking for a rate of zero.
    assert_eq!(resolve_rate(Some(0.0)), MIN_SPEECH_RATE);
    assert_eq!(resolve_rate(Some(99.0)), MAX_SPEECH_RATE);
    assert_eq!(resolve_rate(Some(f32::NAN)), 1.0);
    assert_eq!(resolve_rate(None), 1.0);
}

#[test]
fn the_pace_is_said_in_words_because_the_model_ignores_speed() {
    use crate::commands::speech_synthesis::{resolve_instructions, MAX_STYLE_CHARS};
    // Nothing asked for, nothing sent: an empty instruction is not an
    // instruction to sound ordinary, it is a wasted field.
    assert_eq!(resolve_instructions(None, 1.0), None);
    assert_eq!(resolve_instructions(Some("   ".into()), 1.0), None);

    // gpt-4o-mini-tts takes its pace from `instructions`, so a rate that is
    // not 1.0 has to appear there as well as in `speed`.
    assert!(resolve_instructions(None, 0.75)
        .unwrap()
        .contains("more slowly"));
    assert!(resolve_instructions(None, 1.5).unwrap().contains("faster"));

    // A style survives, is flattened to one line, and is capped so it cannot
    // grow into a second prompt riding along with every spoken reply.
    let styled = resolve_instructions(Some("Warm\n and\tunhurried".into()), 1.0).unwrap();
    assert_eq!(styled, "Warm and unhurried");
    let long = resolve_instructions(Some("x".repeat(400)), 1.0).unwrap();
    assert_eq!(long.chars().count(), MAX_STYLE_CHARS);

    // Both together read as one direction, not two stacked sentences fighting.
    let both = resolve_instructions(Some("Brisk and factual".into()), 1.5).unwrap();
    assert!(both.starts_with("Brisk and factual") && both.contains("faster"));
}
