use std::fs::File;
use std::io::Write;

use crate::commands::voice_level::{level_from_rms, read_tail, rms_of};

/// One second of a sine at `amplitude`, as `arecord` would write it:
/// raw signed 16-bit little-endian, 16 kHz, mono.
fn sine(amplitude: i16, seconds: f64) -> Vec<u8> {
    let samples = (16_000.0 * seconds) as usize;
    let mut pcm = Vec::with_capacity(samples * 2);
    for n in 0..samples {
        let phase = n as f64 / 16_000.0 * 220.0 * std::f64::consts::TAU;
        let value = (phase.sin() * f64::from(amplitude)) as i16;
        pcm.extend_from_slice(&value.to_le_bytes());
    }
    pcm
}

#[test]
fn silence_is_zero_and_never_negative() {
    assert_eq!(rms_of(&[]), 0.0);
    assert_eq!(rms_of(&[0, 0, 0, 0]), 0.0);
    assert_eq!(level_from_rms(0.0), 0.0);
    assert_eq!(level_from_rms(-1.0), 0.0);
}

#[test]
fn rms_of_a_sine_is_its_amplitude_over_root_two() {
    let pcm = sine(10_000, 0.25);
    let expected = 10_000.0 / 2f64.sqrt();
    assert!(
        (rms_of(&pcm) - expected).abs() < 60.0,
        "got {}",
        rms_of(&pcm)
    );
}

#[test]
fn a_trailing_half_sample_is_dropped_rather_than_read_as_silence() {
    let mut pcm = sine(8_000, 0.05);
    pcm.push(0);
    assert!(rms_of(&pcm) > 4_000.0);
}

#[test]
fn ordinary_speech_lands_in_the_middle_of_the_meter() {
    // The whole point of the dBFS mapping: at these amplitudes a linear meter
    // would read 3%, 9% and 30% and look broken.
    let quiet = level_from_rms(rms_of(&sine(300, 0.05)));
    let speaking = level_from_rms(rms_of(&sine(3_000, 0.05)));
    let loud = level_from_rms(rms_of(&sine(14_000, 0.05)));

    assert!(quiet > 0.05 && quiet < 0.4, "quiet was {quiet}");
    assert!(speaking > 0.4 && speaking < 0.85, "speaking was {speaking}");
    assert!(loud > 0.85, "loud was {loud}");
    assert!(quiet < speaking && speaking < loud);
}

#[test]
fn the_meter_is_clamped_at_both_ends() {
    assert_eq!(level_from_rms(f64::from(i16::MAX)), 1.0);
    assert_eq!(level_from_rms(0.000_1), 0.0);
}

#[test]
fn each_tick_reads_only_what_was_appended_since_the_last_one() {
    let dir = std::env::temp_dir().join(format!("vibyra-voice-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("capture.raw");

    let first = sine(6_000, 0.05);
    std::fs::write(&path, &first).unwrap();

    let mut handle = File::open(&path).unwrap();
    let mut offset = 0u64;
    let mut buffer = vec![0u8; 3_200];

    let read = read_tail(&mut handle, &mut offset, &mut buffer).unwrap();
    assert_eq!(read, first.len());
    assert_eq!(offset, first.len() as u64);

    // Nothing new yet: the meter must not re-measure audio it already saw.
    assert_eq!(read_tail(&mut handle, &mut offset, &mut buffer).unwrap(), 0);

    let mut appended = File::options().append(true).open(&path).unwrap();
    appended.write_all(&sine(6_000, 0.02)).unwrap();
    appended.flush().unwrap();
    assert!(read_tail(&mut handle, &mut offset, &mut buffer).unwrap() > 0);

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_backlog_is_skipped_so_the_meter_shows_now() {
    let dir = std::env::temp_dir().join(format!("vibyra-voice-lag-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("capture.raw");
    // Two seconds arriving in one tick — a stalled UI, or a slept machine.
    std::fs::write(&path, sine(6_000, 2.0)).unwrap();

    let mut handle = File::open(&path).unwrap();
    let mut offset = 0u64;
    let mut buffer = vec![0u8; 3_200];
    let read = read_tail(&mut handle, &mut offset, &mut buffer).unwrap();

    assert_eq!(read, 3_200, "a tick must never measure more than 0.1s");
    assert_eq!(offset, 64_000, "and must land at the end of the file");

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn a_replaced_capture_restarts_rather_than_seeking_past_the_end() {
    let dir = std::env::temp_dir().join(format!("vibyra-voice-swap-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("capture.raw");
    std::fs::write(&path, sine(6_000, 0.05)).unwrap();

    let mut handle = File::open(&path).unwrap();
    let mut offset = 0u64;
    let mut buffer = vec![0u8; 3_200];
    read_tail(&mut handle, &mut offset, &mut buffer).unwrap();

    // A new, shorter recording under the same name.
    std::fs::write(&path, sine(6_000, 0.01)).unwrap();
    let mut fresh = File::open(&path).unwrap();
    let read = read_tail(&mut fresh, &mut offset, &mut buffer).unwrap();
    assert!(read > 0, "the meter has to recover, not go silent forever");

    std::fs::remove_dir_all(&dir).ok();
}
