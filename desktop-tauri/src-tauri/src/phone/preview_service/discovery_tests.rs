use super::listener_port;
#[test]
fn only_ipv4_loopback_or_wildcard_listeners_are_candidates() {
    assert_eq!(listener_port("127.0.0.1:8001"), Some(8001));
    assert_eq!(listener_port("*:5173"), Some(5173));
    assert_eq!(listener_port("[::1]:8001"), None);
    assert_eq!(listener_port("192.168.1.4:8080"), None);
    assert_eq!(listener_port("127.0.0.1:0"), None);
}

#[cfg(target_os = "macos")]
#[test]
fn process_start_capture_uses_a_stable_date_order() {
    use chrono::NaiveDateTime;
    use std::time::Duration;
    let pid = std::process::id().to_string();
    let raw = crate::session_process_files::capture_with_timeout(
        "/bin/ps",
        &["-p", &pid, "-o", "pid=,lstart="],
        Duration::from_millis(500),
    )
    .unwrap();
    let (_, date) = raw.trim().split_once(char::is_whitespace).unwrap();
    NaiveDateTime::parse_from_str(date.trim(), "%a %b %e %H:%M:%S %Y").unwrap();
}

#[cfg(target_os = "macos")]
#[test]
#[ignore = "Requires the developer's HKE server on port 8001"]
fn finds_running_hke_server_and_redirect_path() {
    let root = std::path::PathBuf::from("/Users/ellis/Desktop/HKE");
    let servers = super::running(&[("hke".into(), root)]);
    assert!(
        servers.iter().any(|server| server.port == 8001
            && server.start_path == "/menu"
            && super::owns(server)),
        "discovered ports: {:?}",
        servers.iter().map(|server| server.port).collect::<Vec<_>>()
    );
}
