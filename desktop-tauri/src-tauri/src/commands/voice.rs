use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use vibyra_core::agents::program_in_path;

use super::voice_level::spawn_level_meter;

use crate::ai_usage::{voice_cost_usd, AiCall};
use crate::state::AppState;

/// A running `arecord` capture (raw S16LE 16 kHz mono → WAV-wrapped on stop).
pub struct VoiceRecording {
    child: Child,
    path: PathBuf,
    /// Cleared when the capture ends, which is what stops the level meter.
    metering: Arc<AtomicBool>,
}

impl VoiceRecording {
    fn end_metering(&self) {
        self.metering.store(false, Ordering::Relaxed);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceStatus {
    pub recorder: bool,
    pub key_configured: bool,
}

pub const VOICE_MODEL: &str = "whisper-1";

const SAMPLE_RATE: u32 = 16_000;
pub(super) const BYTES_PER_SECOND: usize = SAMPLE_RATE as usize * 2;
/// Whisper is billed by the minute, so a recorder that never stopped — a stuck
/// key, a crashed UI — is the expensive failure here. Audio past this point is
/// discarded before it is ever uploaded.
pub(super) const MAX_RECORDING_SECONDS: usize = 120;

#[tauri::command]
pub async fn voice_status(state: State<'_, AppState>) -> Result<VoiceStatus, String> {
    Ok(VoiceStatus {
        recorder: program_in_path("arecord"),
        key_configured: state.openai_key().is_some(),
    })
}

#[tauri::command]
pub async fn voice_start(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    stop_recorder(&state);
    // Checked before the microphone opens: being refused after speaking a
    // whole sentence is a worse experience than being told up front.
    state.usage.budget_available(state.ai_limits())?;
    let path = std::env::temp_dir().join(format!("vibyra-voice-{}.raw", std::process::id()));
    let _ = std::fs::remove_file(&path);
    let mut command = Command::new("arecord");
    command
        .args(["-q", "-f", "S16_LE", "-r", "16000", "-c", "1", "-t", "raw"])
        .arg(&path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // ALSA resolves its plugins through the loader, and the AppImage points
    // that at its own bundle — record in the user's environment instead.
    vibyra_core::launch_env::sanitize_command(&mut command);
    let child = command
        .spawn()
        .map_err(|e| format!("could not start recording: {e}"))?;
    // The meter reads the file the capture is already writing, so dictation
    // needs no second microphone client and no new permission.
    let metering = Arc::new(AtomicBool::new(true));
    spawn_level_meter(app, path.clone(), Arc::clone(&metering));
    *state.voice.lock() = Some(VoiceRecording {
        child,
        path,
        metering,
    });
    Ok(())
}

#[tauri::command]
pub async fn voice_stop(
    state: State<'_, AppState>,
    discard: bool,
) -> Result<Option<String>, String> {
    let Some(mut recording) = state.voice.lock().take() else {
        return Ok(None);
    };
    recording.end_metering();
    let _ = recording.child.kill();
    let _ = recording.child.wait();
    let raw = std::fs::read(&recording.path).unwrap_or_default();
    let _ = std::fs::remove_file(&recording.path);

    if discard {
        return Ok(None);
    }
    // Anything under ~0.4 s is a stray key tap, not speech. Rejecting it here
    // also keeps a jammed hotkey from spending a paid call per keypress.
    if raw.len() < BYTES_PER_SECOND * 2 / 5 {
        return Err("No speech heard".to_string());
    }

    let key = state.openai_key().ok_or_else(|| {
        "Add your OpenAI API key in Settings › Vibyra AI to use dictation.".to_string()
    })?;

    let raw = &raw[..raw.len().min(BYTES_PER_SECOND * MAX_RECORDING_SECONDS)];
    let seconds = raw.len() as f64 / BYTES_PER_SECOND as f64;
    let permit = state
        .usage
        .reserve(AiCall::Voice, state.ai_limits(), voice_cost_usd(seconds))?;

    let wav = wrap_wav(raw, SAMPLE_RATE, 1);
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
    if let Some(mut recording) = state.voice.lock().take() {
        recording.end_metering();
        let _ = recording.child.kill();
        let _ = recording.child.wait();
        let _ = std::fs::remove_file(&recording.path);
    }
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
