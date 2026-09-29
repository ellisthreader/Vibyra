use crate::{
    identity::{clean_name, Device},
    state::Shared,
};
impl Shared {
    pub fn trust(&self, id: &str, name: &str) -> Result<(), String> {
        self.trust_with_generation(id, name, None)
    }
    pub(crate) fn trust_with_generation(
        &self,
        id: &str,
        name: &str,
        generation: Option<u64>,
    ) -> Result<(), String> {
        let _writes = self.writes.lock().map_err(|_| "Identity unavailable")?;
        if generation.is_some_and(|expected| {
            self.lan_generation
                .load(std::sync::atomic::Ordering::SeqCst)
                != expected
        }) {
            return Err("Local approval expired; connect again".into());
        }
        self.policy_epoch
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
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
}
