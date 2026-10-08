//! Stop locally before waiting for Cloud, including when Cloud is unavailable.
use crate::state::AppState;
use serde::Deserialize;
use serde_json::Value;
use std::future::Future;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RevokeTarget {
    pub host_id: String,
    pub public_key: String,
}
pub(super) enum Target<'a> {
    All,
    Device(&'a str, &'a str),
    Session(&'a str),
    Passkey,
    Other,
}
pub(super) fn target<'a>(
    kind: &str,
    device: Option<&'a RevokeTarget>,
    host: &str,
) -> Result<Target<'a>, String> {
    if kind == "devices" {
        return Ok(Target::All);
    }
    if kind != "device" {
        return Ok(Target::Other);
    }
    let device = device.ok_or("Review this device before revoking it.")?;
    if device.public_key.len() != 64
        || !device
            .public_key
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    {
        return Err("Invalid device key.".into());
    }
    Ok(if host.is_empty() || device.host_id == host {
        Target::Device(&device.public_key, &device.host_id)
    } else {
        Target::Other
    })
}
pub(super) fn local(state: &AppState, target: Target<'_>) -> Result<(), String> {
    let device = match target {
        Target::All => None,
        Target::Device(key, host) => {
            if !state.phone.lock().owns_remote_host(host)? {
                return Ok(());
            }
            Some(key)
        }
        Target::Session(id) => {
            return state
                .phone
                .lock()
                .host
                .as_ref()
                .map_or(Ok(()), |host| host.revoke_remote_session(id));
        }
        Target::Passkey => return state.phone.lock().set_remote(false),
        Target::Other => return Ok(()),
    };
    let phone = state.phone.lock();
    let host = phone.revoke_remote_devices(device);
    let preview = match &state.preview_grants {
        Ok(grants) => match device {
            Some(key) => grants.revoke_device(key),
            None => grants.revoke_all_devices(),
        },
        Err(_) => Ok(()), // Unavailable Preview storage already denies access.
    };
    host.and(preview)
}
pub(super) async fn restrict_then_cloud(
    local: impl FnOnce() -> Result<(), String>,
    cloud: impl Future<Output = Result<Value, String>>,
) -> Result<(), String> {
    let local = local();
    let cloud = cloud.await;
    match (local, cloud) {
        (Ok(()), Ok(_)) => Ok(()),
        (Ok(()), Err(error)) => Err(format!(
            "Local revocation finished. Cloud revocation could not be confirmed: {error}"
        )),
        (Err(error), Ok(_)) => Err(format!(
            "Cloud access was revoked. Local revocation could not be saved: {error}"
        )),
        (Err(local), Err(cloud)) => Err(format!(
            "Local revocation could not be saved: {local}. Cloud revocation failed: {cloud}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    #[tokio::test]
    async fn local_revocation_happens_before_a_failed_or_pending_network_request() {
        let revoked = Cell::new(false);
        let result = restrict_then_cloud(
            || {
                revoked.set(true);
                Ok(())
            },
            async {
                assert!(revoked.get());
                Err("Network unavailable".into())
            },
        )
        .await;
        assert!(revoked.get());
        assert!(result.unwrap_err().contains("Local revocation finished"));
    }
    #[tokio::test]
    async fn local_storage_failure_does_not_skip_cloud_revocation() {
        let requested = Cell::new(false);
        let result = restrict_then_cloud(|| Err("Disk full".into()), async {
            requested.set(true);
            Ok(serde_json::json!({"ok":true}))
        })
        .await;
        assert!(requested.get());
        assert!(result.unwrap_err().contains("Cloud access was revoked"));
    }
    #[test]
    fn displayed_key_is_scoped_to_its_host_and_other_host_revocation_is_not_applied_locally() {
        let device = RevokeTarget {
            host_id: "a".into(),
            public_key: "b".repeat(64),
        };
        assert!(matches!(
            target("device", Some(&device), "a").unwrap(),
            Target::Device(_, _)
        ));
        assert!(matches!(
            target("device", Some(&device), "other").unwrap(),
            Target::Other
        ));
        assert!(target("device", None, "a").is_err());
        assert!(matches!(target("devices", None, "a").unwrap(), Target::All));
    }
}
