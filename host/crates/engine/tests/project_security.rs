mod support;
use serde_json::json;
use support::Harness;

#[test]
fn only_approved_projects_and_contained_utf8_files_are_read() {
    let host = Harness::new();
    std::fs::write(host.path.join("file.txt"), "hello 🦀").unwrap();
    std::fs::write(host.path.join("binary"), [0u8, 1, 2]).unwrap();
    let read = |path| {
        host.engine.handle(
            "phone-a",
            "project.read",
            json!({"projectId":host.project,"path":path}),
        )
    };
    assert_eq!(read("file.txt").unwrap()["content"], "hello 🦀");
    assert!(read("../state/engine.sqlite3").is_err());
    assert!(read("/etc/passwd").is_err());
    assert!(read("C:\\Windows\\win.ini").is_err());
    assert!(read("binary").is_err());
    assert!(host
        .engine
        .handle(
            "phone-a",
            "project.files",
            json!({"projectId":"unapproved"})
        )
        .is_err());
    let files = host
        .engine
        .handle(
            "phone-a",
            "project.files",
            json!({"projectId":host.project}),
        )
        .unwrap();
    assert_eq!(files["entries"].as_array().unwrap().len(), 2);
}

#[cfg(unix)]
#[test]
fn symlinks_cannot_escape_project_and_regular_internal_links_work() {
    use std::os::unix::fs::symlink;
    let host = Harness::new();
    std::fs::write(host.directory.path().join("private"), "must not escape").unwrap();
    std::fs::write(host.path.join("safe"), "safe").unwrap();
    symlink("../private", host.path.join("escape")).unwrap();
    symlink("safe", host.path.join("inside")).unwrap();
    let read = |path| {
        host.engine.handle(
            "phone-a",
            "project.read",
            json!({"projectId":host.project,"path":path}),
        )
    };
    assert!(read("escape").is_err());
    assert_eq!(read("inside").unwrap()["content"], "safe");
}

#[test]
fn large_multibyte_text_is_truncated_at_utf8_boundary() {
    let host = Harness::new();
    std::fs::write(host.path.join("large"), "€".repeat(4000)).unwrap();
    let result = host
        .engine
        .handle(
            "phone-a",
            "project.read",
            json!({"projectId":host.project,"path":"large"}),
        )
        .unwrap();
    assert_eq!(result["truncated"], true);
    assert_eq!(result["content"].as_str().unwrap().len(), 8190);
    assert!(serde_json::to_vec(&result).unwrap().len() < 60 * 1024);
}

#[test]
fn git_review_shows_actual_changes_without_external_diff_execution() {
    use std::process::Command;
    let host = Harness::new();
    let git = |args: &[&str]| {
        assert!(Command::new("git")
            .args(args)
            .current_dir(&host.path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap()
            .success())
    };
    git(&["init"]);
    git(&["config", "user.name", "Vibyra test"]);
    git(&["config", "user.email", "test@example.invalid"]);
    std::fs::write(host.path.join("file"), "before\n").unwrap();
    git(&["add", "file"]);
    git(&["commit", "-m", "Initial"]);
    git(&["config", "diff.external", "definitely-not-a-real-command"]);
    std::fs::write(host.path.join("file"), "after\n").unwrap();
    let params = json!({"projectId":host.project});
    let status = host
        .engine
        .handle("phone-a", "project.status", params.clone())
        .unwrap();
    assert!(status["changes"].as_str().unwrap().contains("file"));
    let diff = host
        .engine
        .handle("phone-a", "project.diff", params)
        .unwrap();
    assert!(diff["diff"].as_str().unwrap().contains("+after"));
}
