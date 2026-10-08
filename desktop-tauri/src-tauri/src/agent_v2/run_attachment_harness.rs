//! Fixtures for the run-path attachment tests: a loopback backend, a claim that
//! names attachments, and a fake `claude` (a shell script that records how it
//! was started and what it was sent).

use crate::agent_v2::attachments_support::*;
use crate::agent_v2::execute::Outcome;
use crate::agent_v2::mock_http::{MockServer, Reply, Request};
use crate::agent_v2::run::{run, Account};
use crate::agent_v2::selection::Selection;
use serde_json::{json, Value};
use std::path::Path;

const INIT: &str = r#"{"type":"system","subtype":"init","tools":["mcp__vibyra-broker__gmail_search"],"mcp_servers":[{"name":"vibyra-broker","status":"connected"}],"apiKeySource":"none","model":"m","claude_code_version":"2.1.285"}"#;
const RESULT: &str = r#"{"type":"result","subtype":"success","is_error":false,"result":"Seen."}"#;
const SCRIPT: &str = r##"#!/bin/sh
REC="__REC__"
pwd > "$REC/cwd"
for a in "$@"; do printf '%s\n' "$a"; done > "$REC/argv"
env | sort | grep -Ev '^(PWD|OLDPWD|SHLVL|_)=' > "$REC/env"
ls ../attachments > "$REC/files" 2>&1
while IFS= read -r line; do
  case "$line" in
    *'"subtype":"initialize"'*)
      echo '{"type":"control_response","response":{"subtype":"success","request_id":"vibyra-init","response":{"account":{"email":"a@b.c","subscriptionType":"Claude Max","apiProvider":"firstParty"}}}}';;
    *'"subtype":"mcp_status"'*)
      id=$(echo "$line" | sed 's/.*"request_id":"\([^"]*\)".*/\1/')
      echo "{\"type\":\"control_response\",\"response\":{\"subtype\":\"success\",\"request_id\":\"$id\",\"response\":{\"mcpServers\":[{\"name\":\"vibyra-broker\",\"status\":\"connected\"}]}}}";;
    *'"type":"user"'*)
      printf '%s\n' "$line" > "$REC/user.json"
      cat "__OUT__";;
  esac
done
"##;

pub(super) struct Recorded {
    pub outcome: Outcome,
    pub requests: Vec<Request>,
    rec: tempfile::TempDir,
}

impl Recorded {
    pub fn read(&self, name: &str) -> Option<String> {
        std::fs::read_to_string(self.rec.path().join(name)).ok()
    }
    /// This run's private folder, as the fake `claude` saw its parent of cwd.
    pub fn root(&self) -> String {
        let cwd = self.read("cwd").expect("claude ran");
        Path::new(cwd.trim())
            .parent()
            .unwrap()
            .to_string_lossy()
            .into_owned()
    }
    /// argv, one per line, with this run's private folder replaced.
    pub fn argv(&self) -> Vec<String> {
        let (text, root) = (self.read("argv").unwrap(), self.root());
        text.lines()
            .map(|line| line.replace(&root, "<RUN>"))
            .collect()
    }
    /// The child's whole environment, with this test's script folder (on PATH) replaced.
    pub fn env(&self) -> String {
        let root = self.rec.path().to_string_lossy().into_owned();
        self.read("env")
            .expect("claude ran")
            .replace(&root, "<CLAUDE>")
    }
    pub fn user(&self) -> Value {
        serde_json::from_str(&self.read("user.json").unwrap()).unwrap()
    }
    pub fn posts(&self) -> Vec<String> {
        let posts = self.requests.iter().filter(|r| r.method == "POST");
        posts
            .map(|r| r.path.rsplit('/').next().unwrap().to_owned())
            .collect()
    }
}

/// Attachment GETs go to `serve(attachment id)`; every other call succeeds.
pub(super) fn backend(serve: impl Fn(&str) -> Reply + Send + Sync + 'static) -> MockServer {
    MockServer::start_raw(
        move |request| match request.path.split("/attachments/").nth(1) {
            Some(tail) => serve(&tail[..36.min(tail.len())]),
            None => Reply {
                status: 200,
                headers: vec![("Content-Type".into(), "application/json".into())],
                body: br#"{"eventCursor":1,"run":{"state":"completed"}}"#.to_vec(),
                length: true,
            },
        },
    )
}

/// A generation-1 claim with one granted (never called) Gmail tool.
pub(super) fn claimed(items: Vec<Value>, prompt: &str) -> Value {
    let tools = json!({"revision": "0000000000000001", "tools": [{"tool": "gmail_search",
        "connectionId": "aaaaaaaa-0000-4000-8000-0000000000aa", "provider": "gmail", "account": "me@example.com",
        "kind": "read", "requiresApproval": false, "schemaRevision": "rev000000001",
        "description": "Search Gmail.", "parameters": {"type": "object", "properties": {}}}]});
    json!({"id": RUN, "generation": 1, "prompt": prompt, "profile": {"name": "Ada"},
        "attachments": items, "tools": tools})
}

pub(super) fn selection() -> Selection {
    Selection {
        provider: "claude".into(),
        account: "default".into(),
        model: "haiku".into(),
        effort: None,
    }
}

/// One real `run()` with the fake CLI (which answers "Seen.").
pub(super) fn run_once(
    items: Vec<Value>,
    serve: impl Fn(&str) -> Reply + Send + Sync + 'static,
) -> Recorded {
    let rec = tempfile::tempdir().unwrap();
    let out = rec.path().join("out.jsonl");
    std::fs::write(&out, format!("{INIT}\n{RESULT}\n")).unwrap();
    let program = rec.path().join("claude");
    let text = SCRIPT
        .replace("__REC__", rec.path().to_str().unwrap())
        .replace("__OUT__", out.to_str().unwrap());
    std::fs::write(&program, text).unwrap();
    std::fs::set_permissions(
        &program,
        std::os::unix::fs::PermissionsExt::from_mode(0o755),
    )
    .unwrap();
    let server = backend(serve);
    let memory = tempfile::tempdir().unwrap();
    let account = Account {
        program,
        config_dir: None,
        memory_roots: vec![memory.path().into()],
    };
    let claim = claimed(items, "What is in my files?");
    let outcome = tauri::async_runtime::block_on(run(
        api(&server),
        claim,
        selection(),
        account,
        std::sync::Arc::new(crate::agent_v2::execute::Control::default()),
    ));
    let requests = server.requests.lock().unwrap().clone();
    Recorded {
        outcome,
        requests,
        rec,
    }
}

/// A photo, a text file and a PDF, with the backend that serves them.
pub(super) fn three() -> (Vec<Value>, impl Fn(&str) -> Reply + Send + Sync + 'static) {
    let files = [
        ("image/jpeg", "photo.jpg", jpeg()),
        ("text/plain", "notes.txt", b"Deploy code: PLUM-7".to_vec()),
        (
            "application/pdf",
            "doc.pdf",
            pdf("The codeword is MANGO-19"),
        ),
    ];
    let items = files
        .iter()
        .zip(IDS)
        .map(|((mime, name, bytes), id)| item(id, name, mime, bytes))
        .collect();
    let serve = move |id: &str| {
        let at = IDS.iter().position(|known| *known == id).unwrap();
        file_reply(files[at].0, &files[at].2)
    };
    (items, serve)
}
