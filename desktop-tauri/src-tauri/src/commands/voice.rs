use serde::Serialize;
use tauri::State;

use crate::ai_usage::{voice_cost_usd, AiCall};
use crate::state::AppState;

#[path = "voice_meter.rs"]
mod meter;
#[path = "voice_resample.rs"]
mod resample;
#[path = "voice_transcribe.rs"]
mod transcribe;
pub use transcribe::VOICE_MODEL;
use transcribe::{resolve_language, transcribe};

#[cfg(any(target_os = "macos", target_os = "windows"))]
#[path = "voice_capture_cpal.rs"]
mod capture;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[path = "voice_capture_process.rs"]
mod capture;
pub struct VoiceRecording {
    capture: capture::VoiceRecording,
    token: String,
}

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
    pub reason: Option<String>,
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
    let (rms, seconds) = recording.capture.level(LEVEL_WINDOW);
    Ok(VoiceLevel {
        recording: true,
        metered: true,
        rms,
        seconds,
    })
}

#[tauri::command]
pub async fn voice_status(state: State<'_, AppState>) -> Result<VoiceStatus, String> {
    let status = crate::assistant_api::status(&state).await;
    Ok(VoiceStatus {
        recorder: recorder_available(),
        key_configured: status.available,
        reason: status.reason,
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
    let token = crate::assistant_api::token(&state)?;
    let status = crate::assistant_api::status(&state).await;
    if !status.available {
        return Err(status
            .reason
            .unwrap_or_else(|| "Vibyra dictation is temporarily unavailable.".into()));
    }
    state.usage.budget_available(state.ai_limits())?;
    let capture = super::run_blocking(capture::VoiceRecording::start).await?;
    state.account.with_token(&token, || {
        *state.voice.lock() = Some(VoiceRecording {
            capture,
            token: token.clone(),
        });
    })?;
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
    let VoiceRecording { capture, token } = recording;
    crate::assistant_api::same_account(&state, &token)?;
    let audio = super::run_blocking(move || resample::canonical(capture.finish()?)).await?;
    let raw = audio.raw;
    let bytes_per_second = audio.sample_rate as usize * 2;

    // Anything under ~0.4 s is a stray key tap, not speech. Rejecting it here
    // also keeps a jammed hotkey from spending a paid call per keypress.
    if raw.len() < bytes_per_second * 2 / 5 {
        return Err("No speech heard".to_string());
    }

    let raw = &raw[..raw.len().min(bytes_per_second * 120)];
    let seconds = raw.len() as f64 / bytes_per_second as f64;
    let permit = state
        .usage
        .reserve(AiCall::Voice, state.ai_limits(), voice_cost_usd(seconds))?;

    let wav = wrap_wav(raw, audio.sample_rate, 1);
    crate::assistant_api::same_account(&state, &token)?;
    let text = transcribe(wav, token.clone(), resolve_language(language)).await?;
    permit.finish_voice(seconds);
    crate::assistant_api::same_account(&state, &token)?;
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
