use std::fs;
use std::sync::atomic::AtomicBool;

use super::plan::{prepare, ScaffoldPlan, ScaffoldSeed, ScaffoldStep};
use super::run::{run_step, StepOutcome};

fn temp_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("vibyra-scaffold-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn plan(dir: &str) -> ScaffoldPlan {
    ScaffoldPlan {
        dir: dir.into(),
        create_dir: true,
        seeds: Vec::new(),
        steps: Vec::new(),
        git_init: false,
    }
}

#[test]
fn refuses_a_folder_that_already_has_files() {
    let root = temp_dir("occupied");
    let target = root.join("app");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("README.md"), "hi").unwrap();
    let error = prepare(&plan(target.to_str().unwrap())).unwrap_err();
    assert!(error.to_string().contains("already has files"));
}

#[test]
fn accepts_an_empty_folder_that_already_exists() {
    let root = temp_dir("empty");
    let target = root.join("app");
    fs::create_dir_all(&target).unwrap();
    assert!(prepare(&plan(target.to_str().unwrap())).is_ok());
}

#[test]
fn refuses_a_relative_destination() {
    let error = prepare(&plan("relative/app")).unwrap_err();
    assert!(error.to_string().contains("full path"));
}

#[test]
fn writes_seeds_and_refuses_ones_that_escape_the_project() {
    let root = temp_dir("seeds");
    let target = root.join("app");
    let mut request = plan(target.to_str().unwrap());
    request.seeds = vec![ScaffoldSeed {
        path: "src/index.ts".into(),
        body: "export const ok = true;\n".into(),
    }];
    prepare(&request).unwrap();
    assert_eq!(
        fs::read_to_string(target.join("src/index.ts")).unwrap(),
        "export const ok = true;\n"
    );

    let escaped = temp_dir("escape").join("app");
    let mut bad = plan(escaped.to_str().unwrap());
    bad.seeds = vec![ScaffoldSeed {
        path: "../outside.txt".into(),
        body: "no".into(),
    }];
    assert!(prepare(&bad).is_err());
}

#[test]
fn resolves_the_dir_and_venv_tokens() {
    let root = temp_dir("tokens");
    let target = root.join("app");
    let mut request = plan(target.to_str().unwrap());
    request.steps = vec![ScaffoldStep {
        label: "Install".into(),
        program: "{{venv}}/pip".into(),
        args: vec!["install".into(), "{{dir}}".into()],
        cwd: target.to_string_lossy().into_owned(),
    }];
    let steps = prepare(&request).unwrap();
    let leaf = if cfg!(windows) { "Scripts" } else { "bin" };
    assert!(steps[0].program.ends_with(&format!(".venv/{leaf}/pip")));
    assert_eq!(steps[0].args[1], target.to_string_lossy());
}

#[cfg(unix)]
#[test]
fn runs_a_step_and_reports_its_output_and_exit_code() {
    let root = temp_dir("run");
    let lines = std::sync::Mutex::new(Vec::new());
    let step = ScaffoldStep {
        label: "Echo".into(),
        program: "sh".into(),
        args: vec!["-c".into(), "echo hello; exit 3".into()],
        cwd: root.to_string_lossy().into_owned(),
    };
    let outcome = run_step(
        &step,
        &|line| lines.lock().unwrap().push(line),
        &AtomicBool::new(false),
    )
    .unwrap();
    assert_eq!(outcome, StepOutcome::Finished(3));
    assert_eq!(lines.lock().unwrap().as_slice(), ["hello".to_string()]);
}

#[cfg(unix)]
#[test]
fn a_cancelled_step_stops_its_whole_process_group() {
    let root = temp_dir("cancel");
    let step = ScaffoldStep {
        label: "Sleep".into(),
        program: "sh".into(),
        args: vec!["-c".into(), "sleep 30".into()],
        cwd: root.to_string_lossy().into_owned(),
    };
    let cancel = std::sync::Arc::new(AtomicBool::new(false));
    let flag = std::sync::Arc::clone(&cancel);
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(200));
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
    });
    let outcome = run_step(&step, &|_| {}, &cancel).unwrap();
    assert_eq!(outcome, StepOutcome::Cancelled);
}
