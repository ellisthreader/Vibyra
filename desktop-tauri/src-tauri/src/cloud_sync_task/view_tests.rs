use super::*;
use vibyra_core::cloud_sync_settings::CloudSyncSettings;
use vibyra_core::settings::ProjectSpec;

fn spec(id: &str) -> ProjectSpec {
    ProjectSpec {
        id: id.into(),
        name: format!("Project {id}"),
        root: format!("/p/{id}"),
        ..Default::default()
    }
}

fn settings(sync: CloudSyncSettings) -> Settings {
    Settings {
        projects: vec![spec("a"), spec("b")],
        cloud_sync: sync,
        ..Settings::default()
    }
}

#[test]
fn the_state_label_follows_the_most_important_fact() {
    let st = ProjectState::default();
    let idle = ProjectLive::default();
    assert_eq!(project_state(false, &idle, &st), "off");
    assert_eq!(
        project_state(
            true,
            &ProjectLive {
                running: true,
                ..Default::default()
            },
            &st
        ),
        "syncing"
    );
    assert_eq!(project_state(true, &idle, &st), "pending");
    assert_eq!(
        project_state(
            true,
            &ProjectLive {
                waiting: true,
                ..Default::default()
            },
            &st
        ),
        "waiting"
    );
    let uploaded = ProjectState {
        up_seq: 2,
        ..Default::default()
    };
    assert_eq!(project_state(true, &idle, &uploaded), "synced");
    assert_eq!(
        project_state(
            true,
            &idle,
            &ProjectState {
                diverged: true,
                up_seq: 2,
                ..Default::default()
            }
        ),
        "diverged"
    );
    assert_eq!(
        project_state(
            true,
            &idle,
            &ProjectState {
                skipped_reason: Some("too_large".into()),
                ..uploaded.clone()
            }
        ),
        "skipped"
    );
    assert_eq!(
        project_state(
            true,
            &idle,
            &ProjectState {
                last_error: Some("x".into()),
                ..uploaded
            }
        ),
        "error"
    );
}

#[test]
fn status_reads_disk_state_held_back_files_and_pending_cloud_changes() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::new(dir.path());
    let key = project_key("a");
    store
        .save(&ProjectState {
            project_key: key.clone(),
            up_seq: 3,
            up_at: Some(1_000),
            held_back: vec![
                HeldBack {
                    path: ".env".into(),
                    reason: "environment file".into(),
                },
                HeldBack {
                    path: "k.pem".into(),
                    reason: "private key".into(),
                },
            ],
            cloud: vec![vibyra_sync::CloudChange {
                project_key: key,
                project: "a".into(),
                seq: 9,
                head: "h".into(),
                base: None,
                files: vec![FileChange {
                    path: "x.rs".into(),
                    status: vibyra_sync::ChangeStatus::Added,
                    mode: "100644".into(),
                }],
            }],
            ..Default::default()
        })
        .unwrap();
    let sync = CloudSyncSettings {
        consent_version: CLOUD_SYNC_CONSENT_VERSION,
        disabled_project_ids: vec!["b".into()],
        ..Default::default()
    };
    let view = build(&settings(sync), true, &BoardData::default(), &store);
    assert_eq!(view.gate, "starting");
    assert_eq!(view.projects[0].state, "synced");
    assert_eq!(view.projects[0].held_back_count, 2);
    assert_eq!(view.projects[0].held_back[1].path, "k.pem");
    assert_eq!(view.projects[1].state, "off");
    assert_eq!(view.held_back_total, 2);
    assert_eq!(view.last_synced_at, Some(1_000));
    assert_eq!(view.pending_files_total, 1);
    assert_eq!(view.projects[0].pending_change.as_ref().unwrap().seq, 9);
    let json = serde_json::to_string(&view).unwrap();
    assert!(!json.to_lowercase().contains("token"));
}

#[test]
fn the_gate_reports_why_nothing_is_syncing() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::new(dir.path());
    let fresh = settings(CloudSyncSettings::default());
    let v = build(&fresh, true, &BoardData::default(), &store);
    assert_eq!(
        (v.gate, v.needs_consent),
        ("starting", false),
        "no dialog before the phone consent is known"
    );
    let board = BoardData {
        consent_checked: true,
        ..Default::default()
    };
    let v = build(&fresh, true, &board, &store);
    assert!(v.needs_consent && v.enabled && !v.consent_from_phone);
    assert_eq!(v.gate, "needsConsent");
    let phone = BoardData {
        gate: Gate::Ready,
        consent_checked: true,
        consent_from_phone: true,
        ..Default::default()
    };
    let v = build(&fresh, true, &phone, &store);
    assert_eq!(
        (v.gate, v.needs_consent, v.consent_from_phone),
        ("ready", false, true)
    );
    assert_eq!(build(&fresh, false, &board, &store).gate, "signedOut");
    let mut paused = CloudSyncSettings::default();
    paused.set_paused(true);
    let v = build(&settings(paused), true, &board, &store);
    assert_eq!(
        (v.gate, v.needs_consent, v.paused, v.enabled),
        ("off", false, true, false)
    );
    let unavailable = BoardData {
        gate: Gate::Unavailable,
        ..Default::default()
    };
    let agreed = settings(CloudSyncSettings {
        consent_version: CLOUD_SYNC_CONSENT_VERSION,
        ..Default::default()
    });
    assert_eq!(
        build(&agreed, true, &unavailable, &store).gate,
        "unavailable"
    );
}

#[path = "view_account_tests.rs"]
mod account_tests;
