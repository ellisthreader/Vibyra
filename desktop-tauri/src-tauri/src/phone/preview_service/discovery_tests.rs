fn listener_port(name: &str) -> Option<u16> {
    super::listener(name).map(|(port, _)| port)
}

#[test]
fn only_loopback_or_wildcard_listeners_are_candidates() {
    assert_eq!(listener_port("127.0.0.1:8001"), Some(8001));
    assert_eq!(listener_port("*:5173"), Some(5173));
    assert_eq!(super::listener("[::1]:5173"), Some((5173, true)));
    assert_eq!(super::listener("127.0.0.1:5173"), Some((5173, false)));
    assert_eq!(listener_port("[fe80::1]:8001"), None);
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
#[ignore = "Requires the developer's HKE server on port 8000 or 8001"]
fn finds_running_hke_server_and_redirect_path() {
    let root = std::path::PathBuf::from("/Users/ellis/Desktop/HKE");
    let servers = super::running(&[("hke".into(), root)]);
    assert!(
        servers
            .iter()
            .any(|server| [8000, 8001].contains(&server.port)
                && server.start_path == "/menu"
                && super::owns(server)),
        "discovered ports: {:?}",
        servers.iter().map(|server| server.port).collect::<Vec<_>>()
    );
}

#[test]
fn an_agent_worktree_outside_the_project_belongs_to_that_project() {
    let temp = tempfile::tempdir().unwrap();
    let base = temp.path().canonicalize().unwrap();
    let project = base.join("pocket");
    let web = project.join("web");
    let worktree = base.join("terminal-worktrees/pocket-a1b2");
    std::fs::create_dir_all(project.join(".git/worktrees/pocket-a1b2")).unwrap();
    std::fs::create_dir_all(&web).unwrap();
    std::fs::create_dir_all(worktree.join("web/src")).unwrap();
    std::fs::write(
        worktree.join(".git"),
        format!(
            "gitdir: {}\n",
            project.join(".git/worktrees/pocket-a1b2").display()
        ),
    )
    .unwrap();
    let roots = [
        ("app".to_string(), project.clone()),
        ("site".to_string(), web.clone()),
    ];
    // A dev server started in the worktree's copy of a sub-project belongs to that sub-project.
    let (id, project_root, serving) = super::owner(&roots, &worktree.join("web/src")).unwrap();
    assert_eq!(
        (id.as_str(), &project_root, &serving),
        ("site", &web, &worktree.join("web"))
    );
    // At the worktree's top it belongs to the whole project.
    assert_eq!(super::owner(&roots, &worktree).unwrap().0, "app");
    // A folder with its own repository, or none, is nobody's.
    let other = base.join("other");
    std::fs::create_dir_all(other.join(".git")).unwrap();
    assert!(super::owner(&roots, &other).is_none());
    assert!(super::owner(&roots, &base).is_none());
}

#[test]
fn a_full_redirect_to_the_same_local_site_is_followed() {
    use super::probe::same_site_path;
    assert_eq!(
        same_site_path("http://127.0.0.1:8000/menu", 8000).as_deref(),
        Some("/menu")
    );
    assert_eq!(
        same_site_path("http://localhost:8000", 8000).as_deref(),
        Some("/")
    );
    assert_eq!(same_site_path("http://127.0.0.1:9000/menu", 8000), None);
    assert_eq!(
        same_site_path("http://127.0.0.1:8000.evil.com/menu", 8000),
        None
    );
    assert_eq!(same_site_path("https://example.com/menu", 8000), None);
}

#[cfg(target_os = "macos")]
#[test]
#[ignore = "Requires the developer's running Metro (Vibyra/mobile) and HKE servers"]
fn a_react_native_bundler_is_not_a_project_website() {
    let vibyra = std::path::PathBuf::from("/Users/ellis/Desktop/Vibyra");
    let hke = std::path::PathBuf::from("/Users/ellis/Desktop/HKE");
    let servers = super::running(&[("vibyra".into(), vibyra), ("hke".into(), hke)]);
    let ports = servers
        .iter()
        .map(|server| (server.project_id.as_str(), server.port))
        .collect::<Vec<_>>();
    assert!(
        !ports.contains(&("vibyra", 8081)),
        "Metro listed as a site: {ports:?}"
    );
    assert!(
        ports.iter().any(|(id, _)| *id == "hke"),
        "HKE missing: {ports:?}"
    );
}
