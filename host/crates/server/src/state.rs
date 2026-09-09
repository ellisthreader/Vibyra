use crate::{
    identity::{clean_name, Device, Identity},
    invitation::Invitation,
};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashSet},
    sync::{Arc, Mutex},
};
use tokio::sync::oneshot;

pub struct Shared {
    pub engine: Arc<dyn crate::backend::Backend>,
    pub identity: Mutex<Identity>,
    pub invitation: Mutex<Option<Invitation>>,
    pub pending: Mutex<BTreeMap<String, (String, oneshot::Sender<bool>)>>,
    pub active: Mutex<HashSet<String>>,
    pub pairing_url: String,
    pub relay: bool,
    /// Nearby phones that found this Host over Bonjour may ask to pair without
    /// a code. Only enabled where the Host advertises itself, and it never
    /// grants trust on its own: `authenticate` still waits for local approval.
    pub nearby: bool,
}

impl Shared {
    pub fn invite(&self, url: Option<&str>) -> Result<String, String> {
        let identity = self.identity.lock().map_err(|_| "Identity unavailable")?;
        let (invitation, uri) =
            Invitation::create(&identity, url.unwrap_or(&self.pairing_url), self.relay)?;
        *self
            .invitation
            .lock()
            .map_err(|_| "Invitations unavailable")? = Some(invitation);
        Ok(uri)
    }

    pub fn trusted(&self, device: &str) -> bool {
        self.identity
            .lock()
            .is_ok_and(|state| state.devices.contains_key(device))
    }

    pub fn consume_invite(&self, token: &str) -> bool {
        let Ok(mut slot) = self.invitation.lock() else {
            return false;
        };
        if slot.as_ref().is_some_and(|invite| invite.valid(token)) {
            *slot = None;
            true
        } else {
            false
        }
    }

    pub fn trust(&self, id: &str, name: &str) -> Result<(), String> {
        let mut identity = self.identity.lock().map_err(|_| "Identity unavailable")?;
        let device = Device {
            id: id.into(),
            name: clean_name(name),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        identity.devices.insert(id.into(), device);
        if let Err(error) = identity.save() {
            identity.devices.remove(id);
            return Err(error);
        }
        Ok(())
    }

    pub fn revoke(&self, id: &str) -> Result<(), String> {
        let mut identity = self.identity.lock().map_err(|_| "Identity unavailable")?;
        let device = identity.devices.remove(id).ok_or("Unknown device")?;
        if let Err(error) = identity.save() {
            identity.devices.insert(id.into(), device);
            return Err(error);
        }
        self.engine.disconnected(id);
        Ok(())
    }

    pub fn answer(&self, id: &str, approve: bool) -> Result<(), String> {
        let (_, sender) = self
            .pending
            .lock()
            .map_err(|_| "Approvals unavailable")?
            .remove(id)
            .ok_or("No pending pairing for this device")?;
        sender
            .send(approve)
            .map_err(|_| "Pairing request expired".into())
    }

    pub fn decorate_state(&self, mut value: Value) -> Value {
        if let Ok(identity) = self.identity.lock() {
            value["host"] =
                json!({"id":identity.id(),"name":identity.name,"platform":std::env::consts::OS});
            value["devices"] = json!(identity.devices.values().collect::<Vec<_>>());
        }
        value
    }
}
