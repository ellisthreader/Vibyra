use super::*;

#[tokio::test]
#[cfg(unix)]
async fn playback_ownership_and_cleanup_without_audio_hardware() {
    let child = std::process::Command::new("/bin/sleep")
        .arg("30")
        .spawn()
        .unwrap();
    *PLAYBACK.lock() = Some(("current".into(), child));
    speech_stop("previous".into()).await.unwrap();
    assert!(speech_active("current".into()).await.unwrap());
    assert!(!speech_active("previous".into()).await.unwrap());
    speech_stop("current".into()).await.unwrap();
    assert!(!speech_active("current".into()).await.unwrap());
    assert!(speech_start("x".into(), "".into()).await.is_err());
    assert!(speech_start("x".into(), "x".repeat(65 * 1024))
        .await
        .is_err());
}
