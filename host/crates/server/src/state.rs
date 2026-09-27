use crate::{
    identity::{clean_name, Device, Identity},
    invitation::Invitation,
};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, Mutex},
};
use tokio::sync::{oneshot, Notify};

/// How a connection reached this Host, for the phone list in Settings.
#[derive(Clone, Debug)]
pub enum Origin {
    /// Direct on this network, with the peer's IP address.
    Nearby(String),
    /// Through the Vibyra Cloud relay; the relay hides the phone's address.
    Cloud,
    /// A test harness or an in-process caller with nothing to record.
    #[cfg(test)]
    Unknown,
}

pub struct Shared {
    pub engine: Arc<dyn crate::backend::Backend>,
    pub identity: Mutex<Identity>,
    /// Held across every write of the identity file, taken before `identity`.
    /// `seen` writes after letting go of `identity`, which every connection
    /// checks each tick, and this keeps its older copy from landing on top of
    /// a trust or revocation saved meanwhile.
    pub writes: Mutex<()>,
    pub invitation: Mutex<Option<Invitation>>,
    pub pending: Mutex<BTreeMap<String, (String, oneshot::Sender<bool>)>>,
    /// One slot per connected device, holding the handle its connection is
    /// asked to stand down through. A phone that comes back takes its own slot
    /// rather than being refused, because a Wi-Fi that dropped can leave the
    /// socket it left behind looking alive here for a long time.
    pub active: Mutex<HashMap<String, Arc<Notify>>>,
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
        let _writes = self.writes.lock().map_err(|_| "Identity unavailable")?;
        let mut identity = self.identity.lock().map_err(|_| "Identity unavailable")?;
        let device = Device {
            id: id.into(),
            name: clean_name(name),
            created_at: chrono::Utc::now().to_rfc3339(),
            last_seen: None,
            last_from: None,
            last_route: None,
        };
        identity.devices.insert(id.into(), device);
        if let Err(error) = identity.save() {
            identity.devices.remove(id);
            return Err(error);
        }
        Ok(())
    }

    /// Records that a trusted phone just authenticated, and from where. Best
    /// effort: a failed save must not refuse a connection that is otherwise
    /// good, so the error is dropped and the in-memory record still updates.
    /// The synced write happens after `identity` is released, so it never
    /// holds up another phone's trust check.
    pub fn seen(&self, id: &str, origin: &Origin) {
        let Ok(_writes) = self.writes.lock() else {
            return;
        };
        let contents = {
            let Ok(mut identity) = self.identity.lock() else {
                return;
            };
            let Some(device) = identity.devices.get_mut(id) else {
                return;
            };
            device.last_seen = Some(chrono::Utc::now().to_rfc3339());
            let (from, route) = match origin {
                Origin::Nearby(address) => (address.clone(), "nearby"),
                Origin::Cloud => ("Vibyra Cloud".to_string(), "cloud"),
                #[cfg(test)]
                Origin::Unknown => return,
            };
            device.last_from = Some(from);
            device.last_route = Some(route.to_string());
            identity.contents()
        };
        if let Ok(contents) = contents {
            let _ = contents.write();
        }
    }

    /// Drops a phone's live connection but keeps it allowed: its slot is told
    /// to stand down, and the connection's own drop reports it gone. The phone
    /// can come straight back without being approved again.
    pub fn disconnect(&self, id: &str) -> Result<(), String> {
        let active = self.active.lock().map_err(|_| "Connections unavailable")?;
        let slot = active.get(id).ok_or("That phone is not connected")?;
        slot.notify_one();
        Ok(())
    }

    pub fn revoke(&self, id: &str) -> Result<(), String> {
        let _writes = self.writes.lock().map_err(|_| "Identity unavailable")?;
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
