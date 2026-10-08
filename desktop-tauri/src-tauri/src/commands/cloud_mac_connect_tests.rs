use super::*;

#[test]
fn zero_projects_stays_empty_and_stale_or_duplicate_choices_fail() {
    let open = vec![("a".into(), "A".into())];
    assert!(validate_picks(&[], &open).is_ok());
    let picked = || PickedProject {
        id: "a".into(),
        name: "A".into(),
    };
    assert!(validate_picks(&[picked()], &open).is_ok());
    assert!(validate_picks(&[picked(), picked()], &open).is_err());
    assert!(validate_picks(
        &[PickedProject {
            id: "a".into(),
            name: "Old name".into()
        }],
        &open
    )
    .is_err());
    assert!(validate_picks(
        &[PickedProject {
            id: "missing".into(),
            name: "A".into()
        }],
        &open
    )
    .is_err());
}

#[test]
fn reviewed_provider_choices_are_exact_booleans_and_never_default_on() {
    let choices: CloudAccountsChoice =
        serde_json::from_value(json!({"claude":false,"codex":true,"github":false})).unwrap();
    assert_eq!(
        serde_json::to_value(choices).unwrap(),
        json!({"claude":false,"codex":true,"github":false})
    );
    assert_eq!(
        serde_json::to_value(CloudAccountsChoice::default()).unwrap(),
        json!({})
    );
    assert!(serde_json::from_value::<CloudAccountsChoice>(json!({"codex":"false"})).is_err());
    assert!(serde_json::from_value::<CloudAccountsChoice>(json!({"codex":null})).is_err());
    assert!(serde_json::from_value::<CloudAccountsChoice>(json!({"other":true})).is_err());
}
