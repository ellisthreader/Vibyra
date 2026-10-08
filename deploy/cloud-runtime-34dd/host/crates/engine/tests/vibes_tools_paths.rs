//! F-22: the AI project tools must refuse dot-leading and dependency paths whatever the letter case
//! (APFS and NTFS resolve `.GIT/config` and `.ENV` to the real files) and whichever separator is used.
use serde_json::{json, Value};
use tempfile::{tempdir, TempDir};
use vibyra_host_engine::Engine;

const SECRET: &str = "sk-live-do-not-leak";
const REFUSED: &str = "This path is not available to the AI project tools";

struct Fixture {
    root: TempDir,
    _state: TempDir,
    engine: Engine,
    scope: Value,
}

fn fixture() -> Fixture {
    let root = tempdir().unwrap();
    let state = tempdir().unwrap();
    for dir in [".git", ".github", "Node_Modules/pkg", ".ssh", "src"] {
        std::fs::create_dir_all(root.path().join(dir)).unwrap();
    }
    for file in [
        ".git/config",
        ".env",
        ".env.local",
        ".ssh/id_rsa",
        "Node_Modules/pkg/index.js",
        ".github/ci.yml",
    ] {
        std::fs::write(root.path().join(file), SECRET).unwrap();
    }
    std::fs::write(root.path().join("src/ok.txt"), "plain project file").unwrap();
    let engine = Engine::new(
        state.path().into(),
        vec![("test".into(), root.path().into())],
    )
    .unwrap();
    let host = engine.handle("phone", "host.state", json!({})).unwrap();
    let mut scope = json!({"projectId": host["projects"][0]["id"], "chatId": uuid::Uuid::new_v4().to_string(),
        "accountToken": uuid::Uuid::new_v4().to_string()});
    let bound = engine.handle("phone", "vibes.bind", scope.clone()).unwrap();
    scope["binding"] = bound["binding"].clone();
    Fixture {
        root,
        _state: state,
        engine,
        scope,
    }
}

fn call(f: &Fixture, operation: &str, path: &str, extra: Value) -> Value {
    let mut p = f.scope.clone();
    p["toolId"] = json!(uuid::Uuid::new_v4().to_string());
    p["operation"] = json!(operation);
    p["path"] = json!(path);
    p["decision"] = json!("allow");
    p["expiresAt"] = json!(chrono::Utc::now().timestamp() + 900);
    for (key, value) in extra.as_object().into_iter().flatten() {
        p[key] = value.clone();
    }
    f.engine.handle("phone", "vibes.tool", p).unwrap()
}

const BLOCKED: [&str; 16] = [
    ".git/config",
    ".GIT/config",
    ".Git/config",
    ".ENV",
    ".Env",
    ".env",
    ".env.local",
    ".ENV.LOCAL",
    "src/.GIT/config",
    "src/.git/config",
    "Node_Modules/pkg/index.js",
    "NODE_MODULES/pkg/index.js",
    ".github/ci.yml",
    ".ssh/id_rsa",
    "src\\.GIT\\config",
    "src/./.env",
];

#[test]
fn reads_refuse_dot_and_dependency_paths_in_any_letter_case() {
    let f = fixture();
    for path in BLOCKED {
        let result = call(&f, "read_file", path, json!({}));
        assert_eq!(result["error"], REFUSED, "read_file {path}");
        assert!(
            !result.to_string().contains(SECRET),
            "read_file {path} leaked the file"
        );
    }
}

#[test]
fn writes_refuse_dot_and_dependency_paths_and_change_nothing() {
    let f = fixture();
    for path in BLOCKED {
        let result = call(
            &f,
            "write_file",
            path,
            json!({"content": "changed", "expectedSha256": "new"}),
        );
        assert!(result["error"].is_string(), "write_file {path}: {result}");
        assert_eq!(result["error"], REFUSED, "write_file {path}");
    }
    for file in [
        ".git/config",
        ".env",
        ".env.local",
        ".ssh/id_rsa",
        "Node_Modules/pkg/index.js",
        ".github/ci.yml",
    ] {
        assert_eq!(
            std::fs::read_to_string(f.root.path().join(file)).unwrap(),
            SECRET,
            "{file} was changed"
        );
    }
    assert!(
        !f.root.path().join("src\\.GIT\\config").exists(),
        "a backslash path created a file"
    );
}

#[test]
fn listing_hides_dot_entries_and_dependency_folders_in_any_case() {
    let f = fixture();
    let result = call(&f, "list_files", "", json!({}));
    let names: Vec<&str> = result["entries"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|e| e["name"].as_str())
        .collect();
    assert!(names.contains(&"src"), "{names:?}");
    for hidden in [
        ".git",
        ".github",
        ".env",
        ".env.local",
        ".ssh",
        "Node_Modules",
    ] {
        assert!(!names.contains(&hidden), "{hidden} is listed: {names:?}");
    }
    for path in [".GIT", ".Github", "Node_Modules", "NODE_MODULES/pkg"] {
        assert_eq!(
            call(&f, "list_files", path, json!({}))["error"],
            REFUSED,
            "list_files {path}"
        );
    }
}

#[test]
fn search_never_reads_a_dot_or_dependency_file_whatever_its_case() {
    let f = fixture();
    std::fs::write(f.root.path().join(".ENV.Prod"), SECRET).unwrap();
    std::fs::write(f.root.path().join("src/.Secrets"), SECRET).unwrap();
    std::fs::write(
        f.root.path().join("src/found.txt"),
        "the needle sk-live here",
    )
    .unwrap();
    let result = call(&f, "search_files", "", json!({"query": "sk-live"}));
    let matches = result["matches"].as_array().unwrap();
    assert!(
        matches.iter().any(|m| m["path"] == "src/found.txt"),
        "{result}"
    );
    assert_eq!(matches.len(), 1, "only the ordinary file matches: {result}");
}

#[test]
fn ordinary_project_files_still_read_write_and_list() {
    let f = fixture();
    assert_eq!(
        call(&f, "read_file", "src/ok.txt", json!({}))["content"],
        "plain project file"
    );
    let wrote = call(
        &f,
        "write_file",
        "src/new.txt",
        json!({"content": "hello", "expectedSha256": "new"}),
    );
    assert_eq!(wrote["written"], true, "{wrote}");
    assert_eq!(
        std::fs::read_to_string(f.root.path().join("src/new.txt")).unwrap(),
        "hello"
    );
}
