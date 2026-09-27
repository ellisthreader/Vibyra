use serde::Serialize;
use tauri::State;

use crate::ai_usage::{voice_cost_usd, AiCall};
use crate::state::AppState;

#[path = "voice_meter.rs"]
mod meter;
#[path = "voice_transcribe.rs"]
mod transcribe;
pub use transcribe::VOICE_MODEL;
use transcribe::{resolve_language, transcribe};

#[cfg(target_os = "macos")]
#[path = "voice_capture_macos.rs"]
mod capture;
#[cfg(not(target_os = "macos"))]
#[path = "voice_capture_process.rs"]
mod capture;
pub use capture::VoiceRecording;

#[cfg(all(target_os = "macos", test))]
#[allow(dead_code)]
#[path = "voice_capture_process.rs"]
mod process_capture;

pub(super) struct CapturedAudio {
    pub raw: Vec<u8>,
    pub sample_rate: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceStatus {
    pub recorder: bool,
    pub key_configured: bool,
}

/// What the microphone is hearing right now. A spoken conversation polls this
/// so a pause can end a turn; `metered` is false where the recorder cannot
/// report a live level, and the caller keeps taking turns by hand.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceLevel {
    pub recording: bool,
    pub metered: bool,
    pub rms: f32,
    pub seconds: f64,
}

/// Long enough to ride out the gaps inside ordinary speech, short enough that
/// the end of a sentence is not a wait.
const LEVEL_WINDOW: std::time::Duration = std::time::Duration::from_millis(350);

#[tauri::command]
pub async fn voice_level(state: State<'_, AppState>) -> Result<VoiceLevel, String> {
    let recording = state.voice.lock();
    let Some(recording) = recording.as_ref() else {
        return Ok(VoiceLevel {
            recording: false,
            metered: false,
            rms: 0.0,
            seconds: 0.0,
        });
    };
    let (rms, seconds) = recording.level(LEVEL_WINDOW);
    Ok(VoiceLevel {
        recording: true,
        metered: true,
        rms,
        seconds,
    })
}

#[tauri::command]
pub async fn voice_status(state: State<'_, AppState>) -> Result<VoiceStatus, String> {
    Ok(VoiceStatus {
        recorder: recorder_available(),
        key_configured: state.openai_key().is_some(),
    })
}

pub(super) fn recorder_available() -> bool {
    capture::available()
}

#[tauri::command]
pub async fn voice_start(state: State<'_, AppState>) -> Result<(), String> {
    stop_recorder(&state);
    // Checked before the microphone opens: being refused after speaking a
    // whole sentence is a worse experience than being told up front.
    if state.openai_key().is_none() {
        return Err(crate::platform_text::for_computer(
            "Dictation is not configured on this Mac. Set OPENAI_API_KEY and restart Vibyra.",
            "Dictation is not configured on this computer. Set OPENAI_API_KEY and restart Vibyra.",
        )
        .into());
    }
    state.usage.budget_available(state.ai_limits())?;
    let recording = super::run_blocking(VoiceRecording::start).await?;
    *state.voice.lock() = Some(recording);
    Ok(())
}

#[tauri::command]
pub async fn voice_stop(
    state: State<'_, AppState>,
    discard: bool,
    language: Option<String>,
) -> Result<Option<String>, String> {
    let Some(recording) = state.voice.lock().take() else {
        return Ok(None);
    };
    if discard {
        drop(recording);
        return Ok(None);
    }
    let audio = super::run_blocking(move || recording.finish()).await?;
    let raw = audio.raw;
    let bytes_per_second = audio.sample_rate as usize * 2;

    // Anything under ~0.4 s is a stray key tap, not speech. Rejecting it here
    // also keeps a jammed hotkey from spending a paid call per keypress.
    if raw.len() < bytes_per_second * 2 / 5 {
        return Err("No speech heard".to_string());
    }

    let key = state.openai_key().ok_or_else(|| {
        crate::platform_text::for_computer(
            "Dictation is not configured on this Mac. Set OPENAI_API_KEY and restart Vibyra.",
            "Dictation is not configured on this computer. Set OPENAI_API_KEY and restart Vibyra.",
        )
        .to_string()
    })?;

    let raw = &raw[..raw.len().min(bytes_per_second * 120)];
    let seconds = raw.len() as f64 / bytes_per_second as f64;
    let permit = state
        .usage
        .reserve(AiCall::Voice, state.ai_limits(), voice_cost_usd(seconds))?;

    let wav = wrap_wav(raw, audio.sample_rate, 1);
    let text = transcribe(wav, key.trim().to_string(), resolve_language(language)).await?;
    permit.finish_voice(seconds);
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("No speech heard".to_string());
    }
    Ok(Some(text))
}

fn stop_recorder(state: &State<'_, AppState>) {
    // Drop stops capture and releases platform resources, including on discard.
    drop(state.voice.lock().take());
}

/// Minimal RIFF/WAVE header around raw S16LE PCM.
fn wrap_wav(raw: &[u8], sample_rate: u32, channels: u16) -> Vec<u8> {
    let byte_rate = sample_rate * channels as u32 * 2;
    let block_align = channels * 2;
    let data_len = raw.len() as u32;
    let mut wav = Vec::with_capacity(44 + raw.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(raw);
    wav
}
