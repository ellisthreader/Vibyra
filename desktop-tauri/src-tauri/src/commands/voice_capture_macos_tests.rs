use super::{append_frames, append_sample, CapturedAudio, VoiceRecording};
use parking_lot::Mutex;
use std::sync::{mpsc, Arc};
use std::time::Duration;

fn samples(bytes: &[u8]) -> Vec<i16> {
    bytes
        .chunks_exact(2)
        .map(|b| i16::from_le_bytes([b[0], b[1]]))
        .collect()
}

#[test]
fn microphone_samples_are_bounded_little_endian_pcm() {
    let mut bytes = Vec::new();
    for value in [0.0, 1.0, -1.0, 9.0, f32::NAN] {
        append_sample(&mut bytes, value);
    }
    assert_eq!(samples(&bytes), [0, 32767, -32767, 32767, 0]);
}

#[test]
fn stereo_is_mixed_to_mono_without_partial_frames_or_exceeding_limit() {
    let mut bytes = Vec::new();
    append_frames(&mut bytes, &[1.0_f32, -1.0, 0.5, 0.5, 1.0], 2, 6);
    assert_eq!(samples(&bytes), [0, 16384]);
    append_frames(&mut bytes, &[1.0_f32, 1.0, -1.0, -1.0], 2, 6);
    assert_eq!(samples(&bytes), [0, 16384, 32767]);
}

#[test]
fn signed_and_unsigned_microphones_preserve_silence_and_polarity() {
    let mut signed = Vec::new();
    let mut unsigned = Vec::new();
    append_frames(&mut signed, &[i16::MIN, 0, i16::MAX], 1, 6);
    append_frames(&mut unsigned, &[u16::MIN, 32768, u16::MAX], 1, 6);
    assert_eq!(samples(&signed), samples(&unsigned));
    let values = samples(&signed);
    assert!(values[0] < -32000 && values[1] == 0 && values[2] > 32000);
}

fn recording() -> (VoiceRecording, mpsc::Receiver<()>) {
    recording_with(Vec::new())
}

fn recording_with(captured: Vec<u8>) -> (VoiceRecording, mpsc::Receiver<()>) {
    let (stop, stopped) = mpsc::channel();
    let (completed, completion) = mpsc::channel();
    let worker = std::thread::spawn(move || {
        stopped
            .recv_timeout(Duration::from_secs(1))
            .map_err(|e| e.to_string())?;
        completed.send(()).unwrap();
        Ok(CapturedAudio {
            raw: vec![0, 0],
            sample_rate: 48_000,
        })
    });
    (
        VoiceRecording {
            stop: Some(stop),
            worker: Some(worker),
            samples: Arc::new(Mutex::new(captured)),
            sample_rate: 48_000,
        },
        completion,
    )
}

fn tone(seconds: f64, amplitude: f32) -> Vec<u8> {
    let mut raw = Vec::new();
    for index in 0..(48_000.0 * seconds) as usize {
        append_sample(&mut raw, amplitude * ((index as f32) * 0.1).sin());
    }
    raw
}

#[test]
fn the_level_reads_the_latest_window_so_a_pause_ends_a_spoken_turn() {
    let mut captured = tone(1.0, 0.8);
    captured.extend(tone(1.0, 0.0));
    let (recording, _completed) = recording_with(captured);
    let (quiet, seconds) = recording.level(Duration::from_millis(400));
    assert!(quiet < 0.01, "a silent tail must read as a pause: {quiet}");
    assert!(
        (seconds - 2.0).abs() < 0.05,
        "elapsed seconds track the whole recording: {seconds}"
    );
    let (loud, _) = recording.level(Duration::from_secs(2));
    assert!(
        loud > 0.1,
        "speech in the window must read as sound: {loud}"
    );
}

#[test]
fn an_empty_recording_reads_as_silence_rather_than_dividing_by_zero() {
    let (recording, _completed) = recording();
    assert_eq!(recording.level(Duration::from_millis(400)), (0.0, 0.0));
}

#[test]
fn finish_stops_worker_and_returns_the_device_sample_rate() {
    let (recording, completed) = recording();
    let audio = recording.finish().unwrap();
    completed.recv_timeout(Duration::from_secs(1)).unwrap();
    assert_eq!(audio.raw, [0, 0]);
    assert_eq!(audio.sample_rate, 48_000);
}

#[test]
fn discard_stops_the_worker_without_transcribing() {
    let (recording, completed) = recording();
    drop(recording);
    completed.recv_timeout(Duration::from_secs(1)).unwrap();
}
