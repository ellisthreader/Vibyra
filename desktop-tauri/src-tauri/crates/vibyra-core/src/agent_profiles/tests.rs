use super::*;
use crate::agent_model::{Engine, PermissionMode, PlaceAccess};
use crate::agentdb::AgentDb;

fn agent(db: &AgentDb, root: &std::path::Path, name: &str) -> AgentProfile {
    create(
        db,
        "acct",
        root,
        NewAgent {
            name: name.into(),
            brief: "Keeps the release notes honest.".into(),
            engine: Engine::Claude,
        },
    )
    .unwrap()
}

/// Creation is atomic across three things: the row, the private folder, and
/// the grant over it. An agent with nowhere to work is a state the rest of the
/// code assumes cannot exist.
#[test]
fn a_new_agent_owns_a_writable_home() {
    let tmp = tempfile::tempdir().unwrap();
    let db = AgentDb::open_memory().unwrap();
    let profile = agent(&db, tmp.path(), "Nia");

    assert!(std::path::Path::new(&profile.home_path).is_dir());
    let places = list_places(&db, &profile.id).unwrap();
    assert_eq!(places.len(), 1);
    assert_eq!(places[0].path, profile.home_path);
    assert_eq!(places[0].access, PlaceAccess::ReadWrite);
}

/// A partial update leaves untouched fields alone — the reason `AgentUpdate`
/// is all `Option` rather than a whole profile echoed back.
#[test]
fn an_update_changes_only_what_it_names() {
    let tmp = tempfile::tempdir().unwrap();
    let db = AgentDb::open_memory().unwrap();
    let profile = agent(&db, tmp.path(), "Nia");

    let changed = update(
        &db,
        "acct",
        &profile.id,
        AgentUpdate {
            permission: Some(PermissionMode::Full),
            ..AgentUpdate::default()
        },
    )
    .unwrap();
    assert_eq!(changed.permission, PermissionMode::Full);
    assert_eq!(changed.name, "Nia");
    assert_eq!(changed.brief, profile.brief);
    assert_eq!(changed.memory_budget, profile.memory_budget);
}

/// The account boundary is enforced in the query, not in the caller.
#[test]
fn another_account_cannot_read_or_change_an_agent() {
    let tmp = tempfile::tempdir().unwrap();
    let db = AgentDb::open_memory().unwrap();
    let profile = agent(&db, tmp.path(), "Nia");

    assert!(get(&db, "someone-else", &profile.id).is_err());
    assert!(list(&db, "someone-else").unwrap().is_empty());
    assert_eq!(list(&db, "acct").unwrap().len(), 1);
}

/// Two spellings of one folder are one permission, not two.
#[test]
fn a_place_is_stored_canonical() {
    let tmp = tempfile::tempdir().unwrap();
    let db = AgentDb::open_memory().unwrap();
    let profile = agent(&db, tmp.path(), "Nia");
    let work = tmp.path().join("work");
    std::fs::create_dir(&work).unwrap();

    let direct = grant_place(&db, &profile.id, work.to_str().unwrap(), PlaceAccess::Read).unwrap();
    let indirect = grant_place(
        &db,
        &profile.id,
        work.join("..").join("work").to_str().unwrap(),
        PlaceAccess::ReadWrite,
    )
    .unwrap();

    assert_eq!(direct.path, indirect.path);
    let places = list_places(&db, &profile.id).unwrap();
    assert_eq!(places.len(), 2, "home plus one place, not home plus two");
    let granted = places.iter().find(|p| p.path == direct.path).unwrap();
    assert_eq!(
        granted.access,
        PlaceAccess::ReadWrite,
        "re-granting raises access"
    );
}

/// `/home/ana-old` starts with `/home/ana` as text and is nowhere near it as a
/// path. The check is component-wise for exactly this case.
#[test]
fn a_shared_name_prefix_is_not_inside_a_place() {
    let tmp = tempfile::tempdir().unwrap();
    let inside = tmp.path().join("ana");
    let sibling = tmp.path().join("ana-old");
    std::fs::create_dir_all(inside.join("deep")).unwrap();
    std::fs::create_dir(&sibling).unwrap();
    let places = vec![AgentPlace {
        id: "p".into(),
        agent_id: "a".into(),
        path: std::fs::canonicalize(&inside)
            .unwrap()
            .to_string_lossy()
            .into_owned(),
        access: PlaceAccess::ReadWrite,
        label: String::new(),
        created_ms: 0,
    }];

    assert!(authorize(&places, &inside.join("deep"), true).is_ok());
    assert!(authorize(&places, &sibling, true).is_err());
}

/// The grant was canonicalised when it was made; the *target* has to be
/// canonicalised again at the check, or a link swapped in afterwards walks the
/// agent straight out of its place.
#[cfg(unix)]
#[test]
fn a_symlink_swapped_in_after_the_grant_does_not_escape() {
    let tmp = tempfile::tempdir().unwrap();
    let place = tmp.path().join("place");
    let elsewhere = tmp.path().join("elsewhere");
    std::fs::create_dir(&place).unwrap();
    std::fs::create_dir(&elsewhere).unwrap();
    let places = vec![AgentPlace {
        id: "p".into(),
        agent_id: "a".into(),
        path: std::fs::canonicalize(&place)
            .unwrap()
            .to_string_lossy()
            .into_owned(),
        access: PlaceAccess::ReadWrite,
        label: String::new(),
        created_ms: 0,
    }];

    let door = place.join("door");
    std::os::unix::fs::symlink(&elsewhere, &door).unwrap();
    let error = authorize(&places, &door.join("secret.txt"), true)
        .unwrap_err()
        .to_string();
    assert!(error.contains("outside every place"), "{error}");
}

/// A file that does not exist yet is the normal case for a write, and must
/// still be judged by where it would actually land.
#[test]
fn a_file_about_to_be_created_is_judged_by_its_parent() {
    let tmp = tempfile::tempdir().unwrap();
    let place = tmp.path().join("place");
    std::fs::create_dir(&place).unwrap();
    let places = vec![AgentPlace {
        id: "p".into(),
        agent_id: "a".into(),
        path: std::fs::canonicalize(&place)
            .unwrap()
            .to_string_lossy()
            .into_owned(),
        access: PlaceAccess::Read,
        label: String::new(),
        created_ms: 0,
    }];

    assert!(authorize(&places, &place.join("new.txt"), false).is_ok());
    let error = authorize(&places, &place.join("new.txt"), true)
        .unwrap_err()
        .to_string();
    assert!(error.contains("may only read"), "{error}");
}

/// A name is trimmed, bounded, and never allowed to be blank or to carry a
/// newline that would make one mention look like two lines of text.
#[test]
fn names_are_cleaned_before_they_reach_a_title_or_a_mention() {
    assert_eq!(clean_name("  Nia  ").unwrap(), "Nia");
    assert_eq!(clean_name("Ni\na").unwrap(), "Ni a");
    assert!(clean_name("   ").is_err());
    assert_eq!(clean_name(&"x".repeat(200)).unwrap().chars().count(), 60);
}
