//! The Host shares as many folders as the backend lets an account have.
use crate::Engine;

#[test]
fn a_host_shares_up_to_the_backend_project_limit_and_no_more() {
    assert_eq!(crate::MAX_PROJECTS, 100);
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("p");
    for n in 0..=crate::MAX_PROJECTS {
        std::fs::create_dir_all(root.join(format!("a{n:03}"))).unwrap();
    }
    let engine = Engine::new_dynamic(dir.path().join("state"), Vec::new()).unwrap();
    assert_eq!(
        engine.adopt_projects_in(&root).unwrap(),
        crate::MAX_PROJECTS
    );
    assert_eq!(
        engine
            .activity(std::time::Duration::from_secs(600))
            .projects
            .len(),
        crate::MAX_PROJECTS
    );
    // The next one is refused, and the scan stays quiet about it.
    assert_eq!(engine.adopt_projects_in(&root).unwrap(), 0);
    let error = engine
        .shared
        .lock()
        .adopt_project(&root.join("a100"))
        .unwrap_err();
    assert!(error.contains("100 projects"), "{error}");
}
