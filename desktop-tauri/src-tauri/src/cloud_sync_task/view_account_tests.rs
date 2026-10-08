use super::*;

#[test]
fn account_connected_follows_what_the_account_said_and_ticks_come_from_it() {
    let tmp = tempfile::tempdir().unwrap();
    let store = Store::new(tmp.path());
    let fresh = settings(CloudSyncSettings::default());
    let unknown = BoardData::default();
    let v = build(&fresh, true, &unknown, &store);
    assert!(!v.account_connected && !v.paused && v.enabled);
    let agreed_on_phone = BoardData {
        account_consent: Some(true),
        consent_checked: true,
        consent_from_phone: true,
        gate: Gate::Ready,
        ..Default::default()
    };
    assert!(build(&fresh, true, &agreed_on_phone, &store).account_connected);
    assert!(
        !build(&fresh, false, &agreed_on_phone, &store).account_connected,
        "signed out"
    );
    // Agreed on this Mac: connected until the account says otherwise (withdrawn on the iPhone).
    let mac = settings(CloudSyncSettings {
        consent_version: CLOUD_SYNC_CONSENT_VERSION,
        ..Default::default()
    });
    assert!(build(&mac, true, &unknown, &store).account_connected);
    let withdrawn = BoardData {
        account_consent: Some(false),
        ..Default::default()
    };
    assert!(!build(&mac, true, &withdrawn, &store).account_connected);
    // The account ticked "a" only; this Mac had switched "a" off once: the account's tick wins.
    let mut switched = CloudSyncSettings::default();
    switched.set_project("a", false);
    let ticked = BoardData {
        ticked_by_account: true,
        not_chosen: ["b".to_string()].into_iter().collect(),
        account_consent: Some(true),
        ..Default::default()
    };
    let v = build(&settings(switched.clone()), true, &ticked, &store);
    assert_eq!(
        (v.projects[0].enabled, v.projects[0].state),
        (true, "pending")
    );
    assert_eq!(
        (v.projects[1].enabled, v.projects[1].state),
        (false, "notChosen")
    );
    // An older server: this Mac's switch is the selection.
    let v = build(&settings(switched), true, &unknown, &store);
    assert_eq!((v.projects[0].enabled, v.projects[0].state), (false, "off"));
    let json = serde_json::to_value(&v).unwrap();
    assert!(json.get("paused").is_some() && json.get("accountConnected").is_some());
}
