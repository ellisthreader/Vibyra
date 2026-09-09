//! CoreAudio capture owned by one worker; never probe the microphone at startup.
use std::sync::{mpsc, Arc};
use std::thread::JoinHandle;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample};
use parking_lot::Mutex;

use super::CapturedAudio;

pub fn available() -> bool {
    true
}

pub struct VoiceRecording {
    stop: Option<mpsc::Sender<()>>,
    worker: Option<JoinHandle<Result<CapturedAudio, String>>>,
}

impl VoiceRecording {
    pub fn start() -> Result<Self, String> {
        let (stop, stopped) = mpsc::channel();
        let (ready, started) = mpsc::sync_channel(1);
        let worker = std::thread::spawn(move || {
            let result = record(stopped, &ready);
            if let Err(error) = &result {
                let _ = ready.send(Err(error.clone()));
            }
            result
        });
        let recording = Self {
            stop: Some(stop),
            worker: Some(worker),
        };
        started.recv_timeout(Duration::from_secs(30))
            .map_err(|_| "Microphone startup timed out. Check System Settings → Privacy & Security → Microphone.".to_string())??;
        Ok(recording)
    }

    pub(super) fn finish(mut self) -> Result<CapturedAudio, String> {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        self.worker
            .take()
            .ok_or("Recording already stopped")?
            .join()
            .map_err(|_| "Microphone capture stopped unexpectedly".to_string())?
    }
}

impl Drop for VoiceRecording {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
    }
}

fn record(
    stopped: mpsc::Receiver<()>,
    ready: &mpsc::SyncSender<Result<(), String>>,
) -> Result<CapturedAudio, String> {
    let device = cpal::default_host()
        .default_input_device()
        .ok_or("Connect a microphone or choose an input device in System Settings → Sound.")?;
    let supported = device.default_input_config().map_err(microphone_error)?;
    let format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    let sample_rate = config.sample_rate;
    let channels = config.channels as usize;
    if channels == 0 || !(8_000..=192_000).contains(&sample_rate) {
        return Err(
            "Choose a microphone input rate between 8 and 192 kHz in Audio MIDI Setup.".into(),
        );
    }
    let capacity = sample_rate as usize * 2 * 120;
    let output = Arc::new(Mutex::new(Vec::with_capacity(capacity)));
    let error = Arc::new(Mutex::new(None));
    let stream = match format {
        SampleFormat::F32 => stream::<f32>(&device, config, channels, capacity, &output, &error),
        SampleFormat::I16 => stream::<i16>(&device, config, channels, capacity, &output, &error),
        SampleFormat::U16 => stream::<u16>(&device, config, channels, capacity, &output, &error),
        SampleFormat::I32 => stream::<i32>(&device, config, channels, capacity, &output, &error),
        SampleFormat::F64 => stream::<f64>(&device, config, channels, capacity, &output, &error),
        _ => return Err("This microphone's audio format is not supported.".into()),
    }?;
    stream.play().map_err(microphone_error)?;
    if ready.send(Ok(())).is_err() {
        return Err("Recording was cancelled".into());
    }
    // Stop the microphone even if the webview never sends Stop.
    let _ = stopped.recv_timeout(Duration::from_secs(120));
    drop(stream);
    if let Some(error) = error.lock().take() {
        return Err(error);
    }
    let raw = std::mem::take(&mut *output.lock());
    Ok(CapturedAudio { raw, sample_rate })
}

fn microphone_error(error: impl std::fmt::Display) -> String {
    format!("Could not use the microphone: {error}. Check Vibyra in System Settings → Privacy & Security → Microphone.")
}

fn stream<T: SizedSample>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    channels: usize,
    limit: usize,
    output: &Arc<Mutex<Vec<u8>>>,
    error: &Arc<Mutex<Option<String>>>,
) -> Result<cpal::Stream, String>
where
    f32: FromSample<T>,
{
    let output = Arc::clone(output);
    let error = Arc::clone(error);
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                let mut raw = output.lock();
                append_frames(&mut raw, data, channels, limit);
            },
            move |failure| {
                *error.lock() = Some(microphone_error(failure));
            },
            Some(Duration::from_secs(10)),
        )
        .map_err(microphone_error)
}

fn append_frames<T: SizedSample>(raw: &mut Vec<u8>, data: &[T], channels: usize, limit: usize)
where
    f32: FromSample<T>,
{
    for frame in data.chunks_exact(channels) {
        if raw.len() + 2 > limit {
            break;
        }
        let mono = frame
            .iter()
            .map(|sample| sample.to_sample::<f32>())
            .sum::<f32>()
            / channels as f32;
        append_sample(raw, mono);
    }
}

fn append_sample(raw: &mut Vec<u8>, mono: f32) {
    let value = if mono.is_finite() {
        mono.clamp(-1.0, 1.0)
    } else {
        0.0
    };
    raw.extend_from_slice(&((value * i16::MAX as f32).round() as i16).to_le_bytes());
}

#[cfg(test)]
#[path = "voice_capture_macos_tests.rs"]
mod tests;
