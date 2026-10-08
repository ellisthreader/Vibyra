use super::*;

const HOME: &str = "/Users/me";
fn kind(path: &str) -> Option<Breadth> {
    classify(Path::new(path), Some(Path::new(HOME)))
}

#[test]
fn the_home_directory_a_disk_root_and_the_folders_above_home_are_too_broad() {
    assert_eq!(kind("/Users/me"), Some(Breadth::Home));
    assert_eq!(kind("/"), Some(Breadth::Root));
    assert_eq!(kind("/Users"), Some(Breadth::Broad));
    assert_eq!(
        classify(Path::new("/home"), Some(Path::new("/home/me"))),
        Some(Breadth::Broad)
    );
    assert_eq!(
        classify(Path::new("/home/me"), Some(Path::new("/home/me"))),
        Some(Breadth::Home)
    );
}

#[test]
fn the_standard_folders_directly_under_home_are_too_broad_in_any_letter_case() {
    for name in HOME_CHILDREN {
        assert_eq!(
            kind(&format!("{HOME}/{name}")),
            Some(Breadth::Broad),
            "{name}"
        );
        assert_eq!(
            kind(&format!("{HOME}/{}", name.to_uppercase())),
            Some(Breadth::Broad),
            "{name} upper"
        );
        assert_eq!(
            kind(&format!("{HOME}/{}", name.to_lowercase())),
            Some(Breadth::Broad),
            "{name} lower"
        );
    }
}

#[test]
fn dot_folders_under_home_hold_credentials_not_projects() {
    for name in [".ssh", ".config", ".aws", ".gnupg", ".claude"] {
        assert_eq!(
            kind(&format!("{HOME}/{name}")),
            Some(Breadth::Broad),
            "{name}"
        );
    }
}

#[test]
fn system_folders_disks_and_other_accounts_are_too_broad() {
    for path in [
        "/Volumes",
        "/Volumes/Backup",
        "/mnt",
        "/mnt/data",
        "/media",
        "/opt",
        "/usr",
        "/var",
        "/etc",
        "/private",
        "/Applications",
        "/Library",
        "/System",
        "/Users/other",
        "/Volumes/BACKUP",
    ] {
        assert_eq!(kind(path), Some(Breadth::Broad), "{path}");
    }
}

#[test]
fn one_project_folder_is_never_flagged_wherever_it_lives() {
    for path in [
        "/Users/me/code",
        "/Users/me/Projects/site",
        "/Users/me/Documents/site",
        "/Users/me/Desktop/site",
        "/Users/me/Documents/a/b",
        "/Users/me/Downloads/repo",
        "/opt/app",
        "/srv/app",
        "/tmp/work",
        "/Volumes/Backup/site",
        "/mnt/data/site",
        "/Users/other/site",
        "/app",
        "/code",
    ] {
        assert_eq!(kind(path), None, "{path}");
    }
}

#[test]
fn without_a_known_home_the_roots_are_still_caught() {
    assert_eq!(classify(Path::new("/"), None), Some(Breadth::Root));
    assert_eq!(classify(Path::new("/Users"), None), Some(Breadth::Broad));
    assert_eq!(classify(Path::new("/Users/me/Documents"), None), None);
}

#[test]
fn a_broad_folder_asks_first_then_is_only_ever_read_only() {
    let home = Some(Path::new(HOME));
    assert_eq!(
        gate(Path::new("/Users/me/Documents"), home, false),
        Gate::Ask(Breadth::Broad)
    );
    assert_eq!(
        gate(Path::new("/Users/me"), home, false),
        Gate::Ask(Breadth::Home)
    );
    assert_eq!(
        gate(Path::new("/Users/me/Documents"), home, true),
        Gate::ReadOnly
    );
    assert_eq!(gate(Path::new("/"), home, true), Gate::ReadOnly);
    assert_eq!(
        gate(Path::new("/Users/me/site"), home, false),
        Gate::Proceed
    );
    assert_eq!(gate(Path::new("/Users/me/site"), home, true), Gate::Proceed);
}

#[test]
fn a_confirmation_belongs_to_one_teammate_one_folder_and_ten_minutes() {
    let pending = Pending::default();
    let now = Instant::now();
    let documents = PathBuf::from("/Users/me/Documents");
    pending.remember("agent-a", documents.clone(), now);
    assert_eq!(
        pending.take("agent-b", now),
        None,
        "another teammate cannot use it"
    );
    assert_eq!(
        pending.take("agent-a", now),
        None,
        "a refused take still spends it"
    );
    pending.remember("agent-a", documents.clone(), now);
    assert_eq!(
        pending.take("agent-a", now + Duration::from_secs(60)),
        Some(documents)
    );
    assert_eq!(
        pending.take("agent-a", now + Duration::from_secs(61)),
        None,
        "it is used once"
    );
    pending.remember("agent-a", PathBuf::from(HOME), now);
    assert_eq!(
        pending.take("agent-a", now + Duration::from_secs(601)),
        None,
        "it expires"
    );
    pending.remember("agent-a", PathBuf::from(HOME), now);
    pending.clear();
    assert_eq!(
        pending.take("agent-a", now),
        None,
        "choosing again forgets it"
    );
}

#[test]
fn the_answer_to_the_renderer_names_the_kind_and_folder_and_arms_one_confirmation() {
    let answer = ask("agent-z", Path::new("/Users/me/Documents"), Breadth::Broad);
    assert_eq!(
        answer,
        json!({"broad": "broad", "path": "/Users/me/Documents", "label": "Documents"})
    );
    assert_eq!(
        PENDING.take("agent-z", Instant::now()),
        Some(PathBuf::from("/Users/me/Documents"))
    );
    assert_eq!(PENDING.take("agent-z", Instant::now()), None);
}
