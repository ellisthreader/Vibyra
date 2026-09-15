//! What a phone may and may not have this Mac build.

use super::{
    backend::DesktopBackend,
    scaffold::{default_parent, validate},
    vault::Vault,
    workspace::{DesktopProject, SharedWorkspace},
};
use serde_json::json;
use std::{path::PathBuf, sync::Arc};
use vibyra_core::pty::{FlushConfig, LaunchSpec, OutputSink, PtyManager};
use vibyra_core::scaffold::ScaffoldPlan;
use vibyra_host::Backend;

struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}
#[allow(dead_code)]
fn unused(_: LaunchSpec) {}

fn backend(projects: Vec<DesktopProject>) -> DesktopBackend {
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let workspace = SharedWorkspace::default();
    workspace.write().publish(projects, vec![], None);
    DesktopBackend::new(
        manager,
        workspace,
        Default::default(),
        Vault::empty(),
        Default::default(),
    )
    .unwrap()
}

fn project(id: &str, path: &str) -> DesktopProject {
    DesktopProject {
        id: id.into(),
        name: id.into(),
        path: path.into(),
    }
}

fn plan(dir: &str, program: &str, cwd: &str) -> ScaffoldPlan {
    ScaffoldPlan {
        dir: dir.into(),
        create_dir: true,
        seeds: vec![],
        steps: vec![vibyra_core::scaffold::ScaffoldStep {
            label: "Create the app".into(),
            program: program.into(),
            args: vec!["create-next-app@latest".into()],
            cwd: cwd.into(),
        }],
        git_init: true,
    }
}

#[test]
fn a_paired_desktop_now_offers_the_wizard() {
    let state = backend(vec![project("p-1", "/Users/someone/Code/site")])
        .handle("phone", "host.state", json!({}))
        .unwrap();
    assert_eq!(state["capabilities"]["scaffoldV1"], json!(true));
    // Starting a project is the exception, not a general write: everything else
    // this adapter refuses stays refused.
    assert_eq!(state["capabilities"]["readOnly"], json!(true));
}

#[test]
fn preflight_answers_with_the_home_and_where_projects_live() {
    let answer = backend(vec![
        project("p-1", "/Users/someone/Code/site"),
        project("p-2", "/Users/someone/Code/api"),
    ])
    .handle("phone", "scaffold.preflight", json!({"tools":["git"]}))
    .unwrap();
    assert_eq!(answer["parent"], json!("/Users/someone/Code"));
    assert!(answer["tools"]["git"].is_boolean());
    assert!(answer["home"].is_string());
}

#[test]
fn preflight_refuses_anything_that_is_not_a_plain_tool_name() {
    let backend = backend(vec![]);
    for tool in ["../git", "rm -rf /", ""] {
        assert!(backend
            .handle("phone", "scaffold.preflight", json!({"tools":[tool]}))
            .is_err());
    }
}

#[test]
fn only_a_folder_this_mac_was_asked_to_build_can_be_opened() {
    // Nothing has been built, so no folder is adoptable — least of all one the
    // phone simply named.
    assert!(backend(vec![])
        .handle("phone", "scaffold.adopt", json!({"dir":"/Users/someone/Secrets"}))
        .is_err());
}

#[test]
fn a_plan_is_refused_before_a_process_runs() {
    let dir = "/Users/someone/Code/site";
    // A shell, an absolute program, and a step that runs somewhere else entirely.
    assert!(validate(&plan(dir, "/bin/sh", dir)).is_err());
    assert!(validate(&plan(dir, "npx", "/etc")).is_err());
    assert!(validate(&plan("relative/path", "npx", "relative/path")).is_err());
    // The shape the wizard actually sends is accepted.
    assert!(validate(&plan(dir, "npx", dir)).is_ok());
    assert!(validate(&plan(dir, "npx", "/Users/someone/Code")).is_ok());
}

#[test]
fn a_start_the_plan_fails_is_answered_rather_than_run() {
    let started = backend(vec![]).handle(
        "phone",
        "scaffold.start",
        json!({"runId":"run-1","plan":{"dir":"nowhere","createDir":true,"seeds":[],"steps":[],"gitInit":false}}),
    );
    assert!(started.is_err(), "a relative folder is not built");
}

#[test]
fn new_projects_go_beside_most_of_the_open_ones() {
    let home = PathBuf::from("/Users/someone");
    let roots = vec![
        PathBuf::from("/Users/someone/Code/site"),
        PathBuf::from("/Users/someone/Code/api"),
        PathBuf::from("/Users/someone/Desktop/one-off"),
    ];
    assert_eq!(
        default_parent(&roots, &home),
        PathBuf::from("/Users/someone/Code")
    );
    // A project loose in the home folder must not make ~ the default parent.
    assert_eq!(
        default_parent(&[PathBuf::from("/Users/someone/loose")], &home),
        PathBuf::from("/Users/someone/Projects")
    );
}
