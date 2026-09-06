#[cfg(unix)]
use super::*;

#[cfg(unix)]
#[test]
fn early_provider_exit_keeps_its_startup_diagnostic() {
    let handle = TurnHandle::new();
    let command = TurnCommand {
        program: "/bin/sh".into(),
        args: vec![
            "-c".into(),
            "printf 'sandbox startup unavailable\n' >&2; read request; exit 1".into(),
        ],
        cwd: "/tmp".into(),
        env: vec![],
        env_remove: vec![],
        prompt: String::new(),
    };
    let mut client = Client::start(command, &handle).unwrap();
    let until = Instant::now() + Duration::from_secs(2);
    while client.stderr.lock().is_empty() && Instant::now() < until {
        std::thread::sleep(Duration::from_millis(10));
    }
    let error = client.request("initialize", json!({})).unwrap_err();
    assert!(error.contains("sandbox startup unavailable"), "{error}");
}
