//! Consent renewal is additive on both clients. Previously granted projects are
//! removed only by the separate, confirmed Cloud-copy deletion action.
use super::PickedProject;
use serde_json::Value;

pub(super) fn validate_existing(
    picks: &[PickedProject],
    open: &[(String, String)],
    access: &Value,
) -> Result<(), String> {
    let existing = access["projects"]
        .as_array()
        .ok_or("Vibyra Cloud could not verify the project selection. Try again.")?;
    for (id, _) in open {
        let key = vibyra_sync::project_key(id);
        let granted = existing
            .iter()
            .any(|p| p["projectKey"].as_str() == Some(&key) && p["allowed"] == true);
        if granted && !picks.iter().any(|p| &p.id == id) {
            return Err("The Cloud project selection changed. Reopen setup to include existing Cloud projects. Remove their Cloud copies from the Cloud page after connecting.".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn empty_means_no_new_grants_and_cannot_hide_an_existing_local_grant() {
        let open = vec![("local".into(), "Local".into())];
        let foreign = json!({"projects":[{"projectKey":vibyra_sync::project_key("other-computer"),"allowed":true}]});
        assert!(validate_existing(&[], &open, &foreign).is_ok());
        assert!(validate_existing(&[], &open, &json!({"projects":[]})).is_ok());
        let existing =
            json!({"projects":[{"projectKey":vibyra_sync::project_key("local"),"allowed":true}]});
        assert!(validate_existing(&[], &open, &existing).is_err());
        assert!(validate_existing(
            &[PickedProject {
                id: "local".into(),
                name: "Local".into()
            }],
            &open,
            &existing
        )
        .is_ok());
        assert!(validate_existing(&[], &open, &json!({})).is_err());
    }
}
