//! Roadmap Part 16: the AI project tools also refuse key and credential files that have no leading dot
//! (`id_rsa`, `*.pem`, `credentials.json`, `secrets.yaml` ...). A pure name rule, always on, no allow list.
use serde_json::{json, Value};
use tempfile::{tempdir, TempDir};
use vibyra_host_engine::Engine;

const SECRET: &str = "fixture-not-a-real-key";
const REFUSED: &str = "This path is not available to the AI project tools";
const SENSITIVE: [&str; 6] = [
    "id_rsa",
    "keys/server.pem",
    "TLS.KEY",
    "credentials.json",
    "config/secrets.yaml",
    "service-account-prod.json",
];

struct Fixture {
    root: TempDir,
    _state: TempDir,
    engine: Engine,
    scope: Value,
}

fn fixture() -> Fixture {
    let root = tempdir().unwrap();
    let state = tempdir().unwrap();
    for dir in ["keys", "config", "src"] {
        std::fs::create_dir_all(root.path().join(dir)).unwrap();
    }
    for file in SENSITIVE {
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

#[test]
fn reads_and_writes_refuse_key_and_credential_files_and_change_nothing() {
    let f = fixture();
    for path in SENSITIVE {
        let read = call(&f, "read_file", path, json!({}));
        assert_eq!(read["error"], REFUSED, "read_file {path}");
        assert!(!read.to_string().contains(SECRET), "{path} leaked");
        let write = call(
            &f,
            "write_file",
            path,
            json!({"content": "changed", "expectedSha256": "new"}),
        );
        assert_eq!(write["error"], REFUSED, "write_file {path}");
        assert_eq!(
            std::fs::read_to_string(f.root.path().join(path)).unwrap(),
            SECRET,
            "{path} changed"
        );
    }
}

#[test]
fn listing_and_search_skip_them_but_keep_ordinary_files() {
    let f = fixture();
    std::fs::write(
        f.root.path().join("src/found.txt"),
        "the needle fixture-not-a-real-key here",
    )
    .unwrap();
    let listed = call(&f, "list_files", "", json!({}));
    let names: Vec<&str> = listed["entries"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|e| e["name"].as_str())
        .collect();
    assert!(
        names.contains(&"src") && names.contains(&"keys"),
        "{names:?}"
    );
    for hidden in ["id_rsa", "credentials.json", "TLS.KEY"] {
        assert!(!names.contains(&hidden), "{hidden} is listed: {names:?}");
    }
    let found = call(
        &f,
        "search_files",
        "",
        json!({"query": "fixture-not-a-real-key"}),
    );
    let paths: Vec<&str> = found["matches"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|m| m["path"].as_str())
        .collect();
    assert_eq!(paths, ["src/found.txt"], "{found}");
}

#[test]
fn a_normal_file_still_reads() {
    let f = fixture();
    assert_eq!(
        call(&f, "read_file", "src/ok.txt", json!({}))["content"],
        "plain project file"
    );
}
