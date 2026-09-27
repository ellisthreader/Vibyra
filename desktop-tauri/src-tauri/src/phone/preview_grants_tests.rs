use super::preview_grants::PreviewGrants;
use super::workspace::{DesktopProject, SharedWorkspace};
use std::fs;
use std::path::{Path, PathBuf};
use vibyra_core::preview::inspect_project;

fn site(path: &Path, name: &str) -> String {
    fs::create_dir_all(path).unwrap();
    fs::write(path.join("index.html"), format!("<h1>{name}</h1>")).unwrap();
    inspect_project(path.to_str().unwrap())
        .unwrap()
        .targets
        .into_iter()
        .find(|target| target.runnable)
        .expect("static preview target")
        .id
}

fn bound_grants(path: PathBuf) -> PreviewGrants {
    let grants = PreviewGrants::load(path).unwrap();
    grants.set_account(Some("user:test-account")).unwrap();
    grants
}

#[test]
fn exact_phone_project_and_worktree_are_required_and_persisted() {
    let temp = tempfile::tempdir().unwrap();
    let first = temp.path().join("project");
    let worktree = temp.path().join("worktree");
    let target = site(&first, "one");
    let other_target = site(&worktree, "two");
    let state = temp.path().join("state");
    let grants = bound_grants(state.clone());
    grants
        .grant("phone-1", "project-1", &first, &target)
        .unwrap();
    let listed = grants.list_for_device("phone-1");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].project_id, "project-1");
    assert_eq!(listed[0].source_root, first);
    assert_eq!(listed[0].target_id, target);
    assert!(!listed[0].id.is_empty());
    assert!(grants.list_for_device("phone-2").is_empty());
    assert!(grants
        .authorize("phone-2", "project-1", &first, &target)
        .is_err());
    assert!(grants
        .authorize("phone-1", "project-2", &first, &target)
        .is_err());
    assert!(grants
        .authorize("phone-1", "project-1", &worktree, &other_target)
        .is_err());
    assert!(grants
        .authorize("phone-1", "project-1", &first, "unapproved")
        .is_err());
    let reloaded = bound_grants(state);
    let allowed = reloaded
        .authorize("phone-1", "project-1", &first, &target)
        .unwrap();
    assert_eq!(allowed.root, fs::canonicalize(first).unwrap());
    assert_eq!(allowed.target_id, target);
}

#[test]
fn opaque_id_requires_current_desktop_project() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("site");
    let target = site(&root, "one");
    let grants = bound_grants(temp.path().join("state"));
    grants.grant("phone", "project", &root, &target).unwrap();
    let id = grants.list_for_device("phone")[0].id.clone();
    let workspace = SharedWorkspace::default();
    assert!(grants
        .authorize_id("phone", &id, &workspace.read())
        .is_err());
    workspace.write().publish(
        vec![DesktopProject {
            id: "project".into(),
            name: "Site".into(),
            path: root.to_str().unwrap().into(),
        }],
        vec![],
        None,
    );
    assert!(grants
        .authorize_id("other-phone", &id, &workspace.read())
        .is_err());
    assert!(grants.authorize_id("phone", &id, &workspace.read()).is_ok());
    workspace.write().publish(vec![], vec![], None);
    assert!(grants
        .authorize_id("phone", &id, &workspace.read())
        .is_err());
}

#[test]
fn missing_or_changed_target_needs_new_mac_approval() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("site");
    let target = site(&root, "one");
    let grants = bound_grants(temp.path().join("state"));
    grants.grant("phone", "project", &root, &target).unwrap();
    fs::remove_file(root.join("index.html")).unwrap();
    assert!(grants
        .authorize("phone", "project", &root, &target)
        .is_err());
    assert!(grants.grant("phone", "project", &root, &target).is_err());
}

#[test]
fn changed_package_script_invalidates_same_display_command() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("site");
    fs::create_dir(&root).unwrap();
    let package = root.join("package.json");
    fs::write(
        &package,
        r#"{"scripts":{"dev":"vite"},"devDependencies":{"vite":"*"}}"#,
    )
    .unwrap();
    let before = inspect_project(root.to_str().unwrap())
        .unwrap()
        .targets
        .remove(0);
    assert!(before.runnable);
    let grants = bound_grants(temp.path().join("state"));
    grants.grant("phone", "project", &root, &before.id).unwrap();
    assert!(grants.is_granted("phone", "project", &root, &before.id));
    fs::write(
        &package,
        r#"{"scripts":{"dev":"vite --host 0.0.0.0"},"devDependencies":{"vite":"*"}}"#,
    )
    .unwrap();
    let after = inspect_project(root.to_str().unwrap())
        .unwrap()
        .targets
        .remove(0);
    assert_eq!(before.id, after.id);
    assert_eq!(before.command, after.command);
    assert!(!grants.is_granted("phone", "project", &root, &after.id));
}

#[cfg(unix)]
#[test]
fn symlink_redirect_cannot_reuse_a_grant() {
    use std::os::unix::fs::symlink;
    let temp = tempfile::tempdir().unwrap();
    let original = temp.path().join("original");
    let replacement = temp.path().join("replacement");
    let target = site(&original, "one");
    site(&replacement, "two");
    let link = temp.path().join("current");
    symlink(&original, &link).unwrap();
    let grants = bound_grants(temp.path().join("state"));
    grants.grant("phone", "project", &link, &target).unwrap();
    fs::remove_file(&link).unwrap();
    symlink(&replacement, &link).unwrap();
    assert!(grants
        .authorize("phone", "project", &link, &target)
        .is_err());
}

#[test]
fn revocation_persists_and_corrupt_state_fails_closed() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("site");
    let target = site(&root, "one");
    let state = temp.path().join("state");
    let grants = bound_grants(state.clone());
    grants.grant("phone-1", "project", &root, &target).unwrap();
    grants.grant("phone-2", "project", &root, &target).unwrap();
    grants.revoke("phone-1", "project", &root, &target).unwrap();
    let reloaded = bound_grants(state.clone());
    assert!(reloaded
        .authorize("phone-1", "project", &root, &target)
        .is_err());
    assert!(reloaded
        .authorize("phone-2", "project", &root, &target)
        .is_ok());
    reloaded.revoke_device("phone-2").unwrap();
    assert!(bound_grants(state.clone())
        .authorize("phone-2", "project", &root, &target)
        .is_err());
    fs::write(state.join("preview-grants.json"), b"broken").unwrap();
    assert!(PreviewGrants::load(state).is_err());
}

#[test]
fn account_teardown_clears_all_grants() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("site");
    let target = site(&root, "one");
    let state = temp.path().join("state");
    let grants = bound_grants(state.clone());
    grants.grant("phone-1", "project", &root, &target).unwrap();
    grants.grant("phone-2", "project", &root, &target).unwrap();
    grants.revoke_all().unwrap();
    assert!(grants.list_for_device("phone-1").is_empty());
    let reloaded = bound_grants(state);
    assert!(reloaded.list_for_device("phone-2").is_empty());
}
