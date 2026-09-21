//! What Vibyra Desktop asks of its embedded listener beyond starting it: this
//! computer's identity, invitations, approvals, revocation, status and the
//! cloud leg.
use crate::embedded::EmbeddedHost;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};

impl EmbeddedHost {
    /// This computer's identity: its static Noise public key, which is what
    /// a phone pins and what the account registry files it under.
    pub fn id(&self) -> String {
        self.shared
            .identity
            .lock()
            .map(|identity| identity.id())
            .unwrap_or_default()
    }
    pub fn invite(&self, url: &str) -> Result<String, String> {
        let uri = self.shared.invite(Some(url))?;
        if self.address.is_ipv4() {
            return Ok(uri);
        }
        // The phone keeps public ws endpoints blocked. This explicit marker is
        // only emitted by the embedded listener with its IPv6 LAN peer filter.
        let encoded = uri
            .strip_prefix("vibyra://pair?data=")
            .ok_or("Invalid invitation")?;
        let bytes = URL_SAFE_NO_PAD.decode(encoded).map_err(|e| e.to_string())?;
        let mut payload: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        payload["network"] = json!("lan");
        Ok(format!(
            "vibyra://pair?data={}",
            URL_SAFE_NO_PAD.encode(payload.to_string())
        ))
    }
    pub fn answer(&self, id: &str, approve: bool) -> Result<(), String> {
        self.shared.answer(id, approve)
    }
    pub fn revoke(&self, id: &str) -> Result<(), String> {
        self.shared.revoke(id)
    }
    pub fn status(&self) -> Value {
        let pending = self
            .shared
            .pending
            .lock()
            .map(|p| {
                p.iter()
                    .map(|(id, (name, _))| json!({"id":id,"name":name}))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let active = self
            .shared
            .active
            .lock()
            .map(|p| p.keys().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        let devices = self
            .shared
            .identity
            .lock()
            .map(|p| p.devices.values().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        let discovery = self.discovery.lock().ok();
        json!({"enabled":true,"listening":true,"port":self.address.port(),"pending":pending,"devices":devices,"active":active,
            "discoverable": discovery.as_ref().is_some_and(|s| s.advertised),
            "discoveryError": discovery.as_ref().and_then(|s| s.error.as_deref())})
    }
}
