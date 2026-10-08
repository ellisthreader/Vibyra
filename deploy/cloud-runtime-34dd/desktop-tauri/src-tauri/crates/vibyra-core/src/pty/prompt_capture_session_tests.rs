use std::sync::Arc;

use super::manager_tests::{shell, TestSink};
use super::{FlushConfig, LaunchSpec, PtyManager};

fn cat() -> LaunchSpec {
    let mut spec = shell("");
    spec.program = "/bin/cat".into();
    spec.args.clear();
    spec
}

#[test]
fn an_agent_terminal_remembers_its_first_request_from_any_writer() {
    let manager = PtyManager::new(Arc::new(TestSink::default()), FlushConfig::default());
    let info = manager.create_session("gemini", "cat", &cat()).unwrap();
    assert_eq!(manager.first_prompt(info.id).unwrap(), None);
    // Typed in pieces, then a second line that must not replace the first.
    manager.write_input(info.id, b"redesign the ").unwrap();
    manager.write_input(info.id, b"website hero\r").unwrap();
    manager
        .write_input(info.id, b"and then something else\r")
        .unwrap();
    assert_eq!(
        manager.first_prompt(info.id).unwrap().as_deref(),
        Some("redesign the website hero")
    );
    manager.remove(info.id).unwrap();
}

#[test]
fn a_shell_or_ssh_line_is_never_kept() {
    let manager = PtyManager::new(Arc::new(TestSink::default()), FlushConfig::default());
    for agent in ["shell", "ssh"] {
        let info = manager.create_session(agent, "cat", &cat()).unwrap();
        manager
            .write_input(info.id, b"export TOKEN=hunter2 now\r")
            .unwrap();
        assert_eq!(manager.first_prompt(info.id).unwrap(), None, "{agent}");
        manager.remove(info.id).unwrap();
    }
}

#[test]
fn an_unknown_terminal_has_no_prompt_to_give() {
    let manager = PtyManager::new(Arc::new(TestSink::default()), FlushConfig::default());
    assert!(manager.first_prompt(9_999).is_err());
}
