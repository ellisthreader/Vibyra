#![allow(dead_code)]
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};
use tempfile::TempDir;
use uuid::Uuid;
use vibyra_host_engine::Engine;

pub struct Harness {
    pub directory: TempDir,
    pub engine: Engine,
    pub project: String,
    pub path: PathBuf,
}

impl Harness {
    pub fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("project");
        std::fs::create_dir(&path).unwrap();
        let engine = Engine::new(
            directory.path().join("state"),
            vec![("Test".into(), path.clone())],
        )
        .unwrap();
        let state = engine.handle("phone-a", "host.state", json!({})).unwrap();
        let project = state["projects"][0]["id"].as_str().unwrap().to_owned();
        Self {
            directory,
            engine,
            project,
            path,
        }
    }

    pub fn create(&self) -> Value {
        self.engine
            .handle(
                "phone-a",
                "session.create",
                json!({"projectId":self.project,
            "title":"Test session","kind":"shell","requestId":Uuid::new_v4().to_string()}),
            )
            .unwrap()
    }

    pub fn claim(&self, session: &Value) -> Value {
        self.engine
            .handle(
                "phone-a",
                "session.claim",
                json!({"sessionId":session["id"]}),
            )
            .unwrap()
    }

    pub fn input(&self, session: &Value, lease: &Value, data: &str) -> Value {
        json!({"sessionId":session["id"],"lease":lease["lease"],"generation":lease["generation"],
            "inputId":Uuid::new_v4().to_string(),"data":data})
    }

    pub fn snapshot(&self, session: &Value) -> Value {
        self.engine
            .handle(
                "phone-a",
                "session.snapshot",
                json!({"sessionId":session["id"]}),
            )
            .unwrap()
    }
}

pub fn wait(mut condition: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(6);
    while Instant::now() < deadline {
        if condition() {
            return;
        }
        std::thread::sleep(Duration::from_millis(15));
    }
    assert!(
        condition(),
        "condition did not become true within six seconds"
    );
}
