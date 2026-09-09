use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ai_usage::{voice_cost_usd, AiCall};
use crate::state::AppState;

#[cfg(target_os = "macos")]
#[path = "voice_capture_macos.rs"]
mod capture;
#[cfg(not(target_os = "macos"))]
#[path = "voice_capture_process.rs"]
mod capture;
pub use capture::VoiceRecording;

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

pub const VOICE_MODEL: &str = "whisper-1";

#[tauri::command]
pub async fn voice_status(state: State<'_, AppState>) -> Result<VoiceStatus, String> {
    Ok(VoiceStatus {
        recorder: capture::available(),
        key_configured: state.openai_key().is_some(),
    })
}

#[tauri::command]
pub async fn voice_start(state: State<'_, AppState>) -> Result<(), String> {
    stop_recorder(&state);
    // Checked before the microphone opens: being refused after speaking a
    // whole sentence is a worse experience than being told up front.
    if state.openai_key().is_none() {
        return Err("Add your OpenAI API key in Settings › Vibyra AI to use dictation.".into());
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
        "Add your OpenAI API key in Settings › Vibyra AI to use dictation.".to_string()
    })?;

    let raw = &raw[..raw.len().min(bytes_per_second * 120)];
    let seconds = raw.len() as f64 / bytes_per_second as f64;
    let permit = state
        .usage
        .reserve(AiCall::Voice, state.ai_limits(), voice_cost_usd(seconds))?;

    let wav = wrap_wav(raw, audio.sample_rate, 1);
    let text = transcribe(wav, key.trim().to_string()).await?;
    permit.finish_voice(seconds);
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("No speech heard".to_string());
    }
    Ok(Some(text))
}

async fn transcribe(wav: Vec<u8>, key: String) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Transcription {
        text: String,
    }

    let part = reqwest::multipart::Part::bytes(wav)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new()
        .text("model", VOICE_MODEL)
        .part("file", part);

    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(key)
        .multipart(form)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("transcription request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v["error"]["message"].as_str().map(String::from))
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(format!("Transcription failed: {detail}"));
    }
    let parsed: Transcription = response.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.text)
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
