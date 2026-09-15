use crate::{
    scaffold::{default_parent, validate},
    Engine,
};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::mpsc::Receiver,
    time::{Duration, Instant},
};

fn setup() -> (tempfile::TempDir, Engine) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("existing")).unwrap();
    let engine = Engine::new(
        dir.path().join("state"),
        vec![("existing".into(), dir.path().join("existing"))],
    )
    .unwrap();
    (dir, engine)
}

fn plan(dir: &Path, steps: Vec<Value>, seeds: Vec<Value>) -> Value {
    json!({"dir":dir,"createDir":true,"seeds":seeds,"steps":steps,"gitInit":false})
}

fn step(program: &str, args: &[&str], cwd: &Path) -> Value {
    json!({"label":format!("Running {program}"),"program":program,"args":args,"cwd":cwd})
}

/// Every event until `scaffold.done` for this run, or a failure after five seconds.
fn until_done(events: &Receiver<Value>, run_id: &str) -> Vec<Value> {
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut seen = Vec::new();
    while Instant::now() < deadline {
        let Ok(event) = events.recv_timeout(Duration::from_millis(100)) else {
            continue;
        };
        let done = event["event"] == "scaffold.done" && event["data"]["runId"] == run_id;
        seen.push(event);
        if done {
            return seen;
        }
    }
    panic!("no scaffold.done within five seconds: {seen:?}");
}

#[test]
fn a_plan_is_refused_before_anything_runs() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("app");
    let parse = |value: Value| serde_json::from_value(value).unwrap();
    assert!(validate(&parse(plan(Path::new("relative/app"), vec![], vec![]))).is_err());
    assert!(validate(&parse(plan(Path::new("/"), vec![], vec![]))).is_err());
    let elsewhere = plan(
        &target,
        vec![step("sh", &["-c", "true"], dir.path().parent().unwrap())],
        vec![],
    );
    assert!(validate(&parse(elsewhere))
        .unwrap_err()
        .contains("beside it"));
    let pathed = plan(&target, vec![step("/usr/bin/env", &[], &target)], vec![]);
    assert!(validate(&parse(pathed)).unwrap_err().contains("not a tool"));
    let venv = plan(
        &target,
        vec![step("{{venv}}/pip", &["install", "x"], &target)],
        vec![],
    );
    assert!(validate(&parse(venv)).is_ok());
    let beside = plan(
        &target,
        vec![step("npm", &["create", "x"], dir.path())],
        vec![],
    );
    assert!(validate(&parse(beside)).is_ok());
}

#[test]
fn new_projects_go_beside_most_of_the_existing_ones() {
    let home = PathBuf::from("/home/ellis");
    let roots = vec![
        PathBuf::from("/home/ellis/Code/a"),
        PathBuf::from("/home/ellis/Code/b"),
        PathBuf::from("/home/ellis/other"),
        PathBuf::from("/srv/site"),
    ];
    assert_eq!(
        default_parent(&roots, &home),
        PathBuf::from("/home/ellis/Code")
    );
    assert_eq!(
        default_parent(&[], &home),
        PathBuf::from("/home/ellis/Projects")
    );
    assert_eq!(
        default_parent(&[PathBuf::from("/home/ellis/x")], &home),
        PathBuf::from("/home/ellis/Projects")
    );
}

#[test]
fn preflight_names_the_tools_and_where_projects_go() {
    let (_dir, engine) = setup();
    let answer = engine
        .handle(
            "phone",
            "scaffold.preflight",
            json!({"tools":["sh","definitely-not-a-tool-x"]}),
        )
        .unwrap();
    assert_eq!(answer["tools"]["sh"], true);
    assert_eq!(answer["tools"]["definitely-not-a-tool-x"], false);
    assert!(answer["home"].as_str().unwrap().starts_with('/'));
    assert!(answer["parent"].as_str().unwrap().starts_with('/'));
    assert!(engine
        .handle("phone", "scaffold.preflight", json!({"tools":["../x"]}))
        .is_err());
    assert_eq!(
        engine.handle("phone", "host.state", json!({})).unwrap()["capabilities"]["scaffoldV1"],
        true
    );
}

#[cfg(unix)]
#[test]
fn a_build_writes_seeds_runs_steps_and_shares_the_folder() {
    let (dir, engine) = setup();
    let target = dir.path().join("fresh-app");
    let events = engine.subscribe();
    let request = plan(
        &target,
        vec![step("sh", &["-c", "echo one; echo two"], &target)],
        vec![json!({"path":"index.html","body":"<h1>hi</h1>\n"})],
    );
    let started = engine
        .handle(
            "phone",
            "scaffold.start",
            json!({"runId":"run-1","plan":request}),
        )
        .unwrap();
    assert_eq!(started["runId"], "run-1");
    let seen = until_done(&events, "run-1");
    let done = seen.last().unwrap();
    assert_eq!(done["data"]["ok"], true, "{done:?}");
    assert_eq!(done["data"]["project"]["name"], "fresh-app");
    assert!(seen.iter().any(|e| e["event"] == "scaffold.step"
        && e["data"]["index"] == 0
        && e["data"]["total"] == 1));
    let lines: Vec<String> = seen
        .iter()
        .filter(|e| e["event"] == "scaffold.output")
        .flat_map(|e| {
            e["data"]["lines"]
                .as_array()
                .unwrap()
                .iter()
                .map(|l| l.as_str().unwrap().to_owned())
                .collect::<Vec<_>>()
        })
        .collect();
    assert_eq!(lines, ["one", "two"]);
    assert!(seen.iter().any(|e| e["event"] == "host.changed"));
    assert_eq!(
        std::fs::read_to_string(target.join("index.html")).unwrap(),
        "<h1>hi</h1>\n"
    );
    let state = engine.handle("phone", "host.state", json!({})).unwrap();
    let names: Vec<&str> = state["projects"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["existing", "fresh-app"]);
    let status = engine
        .handle("phone", "scaffold.status", json!({"runId":"run-1"}))
        .unwrap();
    assert_eq!(status["phase"], "done");
    assert_eq!(status["lines"].as_array().unwrap().len(), 2);
    assert_eq!(status["project"]["name"], "fresh-app");
    // The new project can be used like any other, and survives a restart.
    let files = engine
        .handle(
            "phone",
            "project.files",
            json!({"projectId":done["data"]["project"]["id"]}),
        )
        .unwrap();
    assert_eq!(files["entries"][0]["name"], "index.html");
    drop(engine);
    // The PTY flusher thread lets go of the journal a tick after the engine
    // does, which a process restart never notices; a test has to wait for it.
    let again = (0..50)
        .find_map(|_| {
            Engine::new(
                dir.path().join("state"),
                vec![("existing".into(), dir.path().join("existing"))],
            )
            .ok()
            .or_else(|| {
                std::thread::sleep(Duration::from_millis(50));
                None
            })
        })
        .expect("the state directory is released after the engine drops");
    let state = again.handle("phone", "host.state", json!({})).unwrap();
    assert_eq!(state["projects"].as_array().unwrap().len(), 2);
    assert_eq!(state["projects"][1]["name"], "fresh-app");
}

#[cfg(unix)]
#[test]
fn a_failed_step_reports_why_and_the_folder_can_still_be_opened() {
    let (dir, engine) = setup();
    let target = dir.path().join("broken");
    let events = engine.subscribe();
    let request = plan(
        &target,
        vec![step("sh", &["-c", "echo partial; exit 3"], &target)],
        vec![],
    );
    engine
        .handle(
            "phone",
            "scaffold.start",
            json!({"runId":"run-2","plan":request}),
        )
        .unwrap();
    let done = until_done(&events, "run-2").pop().unwrap();
    assert_eq!(done["data"]["ok"], false);
    assert_eq!(done["data"]["stalled"], false);
    assert!(done["data"]["message"]
        .as_str()
        .unwrap()
        .contains("exit code 3"));
    // Only a folder this computer was asked to build may be opened as it stands.
    assert!(engine
        .handle(
            "phone",
            "scaffold.adopt",
            json!({"dir":dir.path().join("existing")})
        )
        .is_err());
    let adopted = engine
        .handle("phone", "scaffold.adopt", json!({"dir":target}))
        .unwrap();
    assert_eq!(adopted["project"]["name"], "broken");
    assert!(
        engine
            .handle(
                "phone",
                "scaffold.start",
                json!({"runId":"run-2","plan":plan(&target, vec![], vec![])})
            )
            .is_ok(),
        "a finished run id can be started again"
    );
}

#[cfg(unix)]
#[test]
fn a_build_can_be_cancelled_and_one_runs_at_a_time() {
    let (dir, engine) = setup();
    let target = dir.path().join("slow");
    let events = engine.subscribe();
    let request = plan(
        &target,
        vec![step("sh", &["-c", "sleep 30"], &target)],
        vec![],
    );
    engine
        .handle(
            "phone",
            "scaffold.start",
            json!({"runId":"run-3","plan":request}),
        )
        .unwrap();
    let busy = engine.handle(
        "phone",
        "scaffold.start",
        json!({"runId":"run-4","plan":plan(&target, vec![], vec![])}),
    );
    assert!(busy.unwrap_err().contains("still being built"));
    assert_eq!(
        engine
            .handle("phone", "scaffold.status", json!({"runId":"run-3"}))
            .unwrap()["phase"],
        "running"
    );
    engine
        .handle("phone", "scaffold.cancel", json!({"runId":"run-3"}))
        .unwrap();
    let done = until_done(&events, "run-3").pop().unwrap();
    assert_eq!(done["data"]["ok"], false);
    assert_eq!(done["data"]["message"], "Cancelled.");
    assert!(engine
        .handle("phone", "scaffold.cancel", json!({"runId":"nope"}))
        .is_err());
}
