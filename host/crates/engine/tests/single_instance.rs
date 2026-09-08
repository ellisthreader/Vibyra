use vibyra_host_engine::Engine;

#[test]
fn second_host_cannot_mutate_first_hosts_session_journal() {
    let directory = tempfile::tempdir().unwrap();
    let project = directory.path().join("project");
    std::fs::create_dir(&project).unwrap();
    let projects = vec![("Test".into(), project)];
    let state = directory.path().join("state");
    let first = Engine::new(state.clone(), projects.clone()).unwrap();
    let second = Engine::new(state, projects);
    assert!(second.is_err());
    drop(first);
}
