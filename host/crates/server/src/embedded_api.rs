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
    pub fn lan_approval_mode(&self) -> String {
        self.shared
            .lan_mode()
            .map(|mode| mode.name().to_owned())
            .unwrap_or_else(|_| "disabled".into())
    }
    /// A policy change closes current connections and outstanding approvals;
    /// the listener remains available so the owner can enable access again.
    pub fn set_lan_approval_mode(&self, mode: &str) -> Result<(), String> {
        self.shared
            .set_lan_mode(crate::lan_authorization::LanMode::parse(mode)?)
    }
    /// Account boundaries require new nearby consent even if saved Noise keys
    /// remain paired. Already-approved sessions are ended as well.
    pub fn request_lan_reapproval(&self) -> Result<(), String> {
        let result = self
            .shared
            .set_lan_mode(crate::lan_authorization::LanMode::Ask);
        self.shared.end_connections();
        result
    }
    /// Call only after the owner approved this exact key locally and the API
    /// accepted the target-Host ownership proof. This is not a remote RPC.
    pub fn approve_remote_device(&self, id: &str, name: &str) -> Result<(), String> {
        if id.len() != 64
            || !id
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err("Invalid remote device key".into());
        }
        self.shared.trust(id, name)
    }
    pub fn revoke(&self, id: &str) -> Result<(), String> {
        self.shared.revoke(id)
    }
    pub fn revoke_remote_session(&self, id: &str) -> Result<(), String> {
        self.shared.revoke_remote_session(id)
    }
    pub fn revoke_all_devices(&self) -> Result<(), String> {
        self.shared
            .policy_epoch
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        self.shared
            .lan_generation
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let _writes = self
            .shared
            .writes
            .lock()
            .map_err(|_| "Identity unavailable")?;
        let contents = {
            let mut identity = self
                .shared
                .identity
                .lock()
                .map_err(|_| "Identity unavailable")?;
            identity.devices.clear();
            identity.contents()
        };
        if let Ok(mut pending) = self.shared.pending.lock() {
            pending.clear();
        }
        if let Ok(mut invitation) = self.shared.invitation.lock() {
            *invitation = None;
        }
        self.shared.end_connections();
        contents?.write()
    }
    pub fn disconnect(&self, id: &str) -> Result<(), String> {
        self.shared.disconnect(id)
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
            "lanApprovalMode":self.lan_approval_mode(),
            "securitySyncPending":self.shared.policy_pending.load(std::sync::atomic::Ordering::SeqCst),
            "discoverable": discovery.as_ref().is_some_and(|s| s.advertised),
            "discoveryError": discovery.as_ref().and_then(|s| s.error.as_deref())})
    }
}
