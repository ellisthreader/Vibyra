use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use super::voice::{BYTES_PER_SECOND, MAX_RECORDING_SECONDS};

// The dictation meter, split from `voice.rs` because it is a separate concern
// from the capture: nothing here can change what gets transcribed, and the two
// pure functions at the bottom are the whole reason the HUD can pulse.

/// Microphone loudness, 0..1, for the dictation HUD.
pub const VOICE_LEVEL_EVENT: &str = "voice:level";

/// How often the level is sampled. 20 Hz is smooth enough for a voice envelope
/// and a fifth of the work of matching the display; the HUD leans on a short
/// CSS transition to fill the gaps on the compositor rather than in JS.
const LEVEL_INTERVAL: Duration = Duration::from_millis(50);
/// Never measure more than a tenth of a second in one tick. If the meter falls
/// behind it should catch up to *now* rather than replay the backlog.
const LEVEL_MAX_BYTES: u64 = BYTES_PER_SECOND as u64 / 10;
/// Backstop: the meter cannot outlive the longest recording we would upload.
const LEVEL_MAX_TICKS: usize = MAX_RECORDING_SECONDS * 1_000 / 50;

/// Reads the bytes `arecord` has appended since the last tick and emits their
/// loudness.
///
/// Chosen over opening a second microphone in the webview: the capture is
/// already writing this file, so the meter needs no second client — which
/// plain ALSA is not obliged to allow — and no new permission prompt. A tick
/// is one metadata call, one short read, and a sum of squares over ~800
/// samples.
///
/// An ordinary thread rather than a runtime task: it sleeps for its whole life
/// and dies with the recording, so it must not hold a runtime worker.
pub fn spawn_level_meter(app: AppHandle, path: PathBuf, active: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let mut offset = 0u64;
        let mut file: Option<File> = None;
        let mut buffer = vec![0u8; LEVEL_MAX_BYTES as usize];
        let mut ticks = 0usize;

        while active.load(Ordering::Relaxed) && ticks < LEVEL_MAX_TICKS {
            ticks += 1;
            std::thread::sleep(LEVEL_INTERVAL);
            // `arecord` creates the file a moment after it is spawned, so the
            // first tick or two legitimately find nothing to open.
            if file.is_none() {
                file = File::open(&path).ok();
            }
            let Some(handle) = file.as_mut() else {
                continue;
            };
            let read = read_tail(handle, &mut offset, &mut buffer).unwrap_or(0);
            if read == 0 {
                continue;
            }
            let _ = app.emit(VOICE_LEVEL_EVENT, level_from_rms(rms_of(&buffer[..read])));
        }
        // Settle the meter rather than leaving it frozen on the last syllable.
        let _ = app.emit(VOICE_LEVEL_EVENT, 0.0f32);
    });
}

/// Copies the newest audio into `buffer`, advancing `offset` past it.
///
/// A shrunk file means the capture was replaced under us, so the offset
/// restarts rather than seeking past the end forever.
pub fn read_tail(file: &mut File, offset: &mut u64, buffer: &mut [u8]) -> std::io::Result<usize> {
    let len = file.metadata()?.len();
    if len < *offset {
        *offset = 0;
    }
    if len <= *offset {
        return Ok(0);
    }
    if len - *offset > LEVEL_MAX_BYTES {
        *offset = len - LEVEL_MAX_BYTES;
    }
    file.seek(SeekFrom::Start(*offset))?;
    let read = file.read(buffer)?;
    *offset += read as u64;
    Ok(read)
}

/// Root mean square of a raw S16LE chunk, in sample units.
///
/// A trailing odd byte is dropped: `arecord` writes whole frames, but a read
/// can land mid-frame, and half a sample is not a quiet one.
pub fn rms_of(pcm: &[u8]) -> f64 {
    let mut sum = 0f64;
    let mut count = 0u32;
    for frame in pcm.chunks_exact(2) {
        let sample = f64::from(i16::from_le_bytes([frame[0], frame[1]]));
        sum += sample * sample;
        count += 1;
    }
    if count == 0 {
        return 0.0;
    }
    (sum / f64::from(count)).sqrt()
}

/// Maps RMS onto 0..1 the way an ear hears it rather than the way a sample
/// counts.
///
/// A quiet room floors around -55 dBFS and speaking into a desk microphone
/// reaches about -10, so the usable range of a voice sits between them. Using
/// raw amplitude instead would leave ordinary speech in the bottom eighth of
/// the meter, which reads as broken rather than as quiet.
pub fn level_from_rms(rms: f64) -> f32 {
    const FLOOR_DB: f64 = -55.0;
    const CEIL_DB: f64 = -10.0;
    if rms <= 0.0 {
        return 0.0;
    }
    let db = 20.0 * (rms / f64::from(i16::MAX)).log10();
    (((db - FLOOR_DB) / (CEIL_DB - FLOOR_DB)) as f32).clamp(0.0, 1.0)
}
