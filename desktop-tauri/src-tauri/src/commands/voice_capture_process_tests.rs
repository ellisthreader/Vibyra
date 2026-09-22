use super::*;

#[test]
fn pipe_capture_is_bounded_to_two_minutes() {
    let samples = Arc::new(Mutex::new(Vec::new()));
    let (ready, started) = mpsc::sync_channel(1);
    let input: Vec<u8> = (0..MAX_BYTES * 2)
        .map(|index| if index % 2 == 0 { 0 } else { 64 })
        .collect();
    read_samples(std::io::Cursor::new(input), Arc::clone(&samples), ready).unwrap();
    started.recv().unwrap().unwrap();
    let raw = samples.lock();
    assert_eq!(raw.len(), MAX_BYTES);
}

#[test]
fn a_recorder_that_exits_without_samples_never_claims_to_be_recording() {
    let (ready, started) = mpsc::sync_channel(1);
    read_samples(std::io::empty(), Arc::new(Mutex::new(Vec::new())), ready).unwrap();
    assert!(started.recv().unwrap().is_err());
}

#[cfg(unix)]
#[test]
fn finish_and_discard_stop_the_recorder_without_leaving_audio_on_disk() {
    fn recorder() -> VoiceRecording {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "printf '\\000\\100\\000\\100'; exec sleep 30"]);
        VoiceRecording::from_command(command).unwrap()
    }
    let recording = recorder();
    let audio = recording.finish().unwrap();
    assert_eq!(audio.raw, [0, 64, 0, 64]);
    assert_eq!(audio.sample_rate, SAMPLE_RATE);
    drop(recorder());
}

#[cfg(unix)]
#[test]
fn startup_rejects_a_missing_input_device() {
    let mut command = Command::new("/bin/sh");
    command.args(["-c", "exit 1"]);
    assert!(VoiceRecording::from_command(command).is_err());
}
