//! LAN pairing is local authorization, independent of account sessions. Old
//! installations default to asking again; persistent trust is an explicit mode.
use crate::state::Shared;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum LanMode {
    #[default]
    Ask,
    Trusted,
    Disabled,
}
impl LanMode {
    pub(crate) fn name(self) -> &'static str {
        match self {
            Self::Ask => "ask",
            Self::Trusted => "trusted",
            Self::Disabled => "disabled",
        }
    }
    pub(crate) fn parse(value: &str) -> Result<Self, String> {
        match value {
            "ask" => Ok(Self::Ask),
            "trusted" => Ok(Self::Trusted),
            "disabled" => Ok(Self::Disabled),
            _ => Err("Choose a local remote access mode".into()),
        }
    }
}
impl Shared {
    pub(crate) fn lan_mode(&self) -> Result<LanMode, String> {
        self.identity
            .lock()
            .map(|identity| {
                if identity.lan_mode == LanMode::Trusted
                    && self
                        .policy_pending
                        .load(std::sync::atomic::Ordering::SeqCst)
                {
                    LanMode::Ask
                } else {
                    identity.lan_mode
                }
            })
            .map_err(|_| "Host identity unavailable".into())
    }
    pub(crate) fn set_lan_mode(&self, mode: LanMode) -> Result<(), String> {
        self.policy_epoch
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        self.lan_generation
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let _writes = self
            .writes
            .lock()
            .map_err(|_| "Host identity unavailable")?;
        let result = {
            let mut identity = self
                .identity
                .lock()
                .map_err(|_| "Host identity unavailable")?;
            let old = identity.lan_mode;
            identity.lan_mode = mode;
            let result = if old == mode { Ok(()) } else { identity.save() };
            // Failure may tighten access, but must not persistently widen it.
            if result.is_err() && mode == LanMode::Trusted {
                identity.lan_mode = old;
            }
            result
        };
        if let Ok(mut pending) = self.pending.lock() {
            for (_, (_, answer, _)) in std::mem::take(&mut *pending) {
                let _ = answer.send(false);
            }
        }
        self.end_connections();
        result
    }
    pub(crate) fn end_connections(&self) {
        let devices = self
            .active
            .lock()
            .map(|active| {
                for slot in active.values() {
                    slot.notify_one();
                }
                active.keys().cloned().collect::<Vec<_>>()
            })
            .unwrap_or_default();
        // Stop queued controls and Preview streams even when a socket writer
        // is waiting for backpressure and has not polled its wakeup yet.
        for device in devices {
            self.engine.disconnected(&device);
        }
    }
}
