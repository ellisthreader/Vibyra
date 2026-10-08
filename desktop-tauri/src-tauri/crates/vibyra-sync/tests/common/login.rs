#![allow(dead_code)]
//! Shared by the login tests: a fake-contents fixture and helpers around the rig.
use super::fake::LoginFake;
use super::rig::Rig;
use super::*;
use std::path::PathBuf;
use vibyra_sync::CodexSource;

pub const FAKE: &str =
    r#"{"OPENAI_API_KEY":null,"tokens":{"refresh_token":"FAKE-REFRESH-TOKEN-1"}}"#;

pub fn codex_home(r: &Rig) -> PathBuf {
    r.t.path().join("fake-codex-home")
}

pub fn source(r: &Rig) -> CodexSource {
    CodexSource::in_codex_home(&codex_home(r)).unwrap()
}

pub fn put_auth(r: &Rig, body: &str) {
    write(&codex_home(r), "auth.json", body);
}

pub fn login<T>(r: &Rig, f: impl FnOnce(&LoginFake) -> T) -> T {
    f(&r.fake.st.lock().unwrap().login)
}

pub fn backdate_sent_at(r: &Rig) {
    let path = r.engine.state_dir().join("cloud-sync/logins.json");
    let mut v: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    v["codex"]["sentAt"] = serde_json::json!(1);
    std::fs::write(path, serde_json::to_vec(&v).unwrap()).unwrap();
}
