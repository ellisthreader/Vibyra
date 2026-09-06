use crate::state::{Lease, Session};
use crate::{identifier, text, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

fn authorized(session: &Session, device: &str, params: &Value) -> Result<u64, String> {
    if session.meta.status != "running" {
        return Err("session is no longer running".into());
    }
    if session.generation != text(params, "generation")? {
        return Err("stale session generation".into());
    }
    let lease = session
        .lease
        .as_ref()
        .ok_or("claim terminal control first")?;
    if lease.device != device || lease.token != text(params, "lease")? {
        return Err("terminal control belongs to another lease".into());
    }
    session
        .native_id
        .ok_or_else(|| "session is interrupted".into())
}

impl Engine {
    pub(crate) fn claim(&self, device: &str, params: &Value) -> Result<Value, String> {
        let mut state = self.shared.lock();
        let session = state
            .sessions
            .get_mut(text(params, "sessionId")?)
            .ok_or("session not found")?;
        if session.meta.status != "running" {
            return Err("session is no longer running".into());
        }
        if let Some(lease) = &session.lease {
            if lease.device != device {
                return Err("another device currently controls this terminal".into());
            }
        } else {
            session.lease = Some(Lease {
                device: device.into(),
                token: Uuid::new_v4().to_string(),
            });
        }
        Ok(
            json!({"lease":session.lease.as_ref().expect("claimed").token,"generation":session.generation}),
        )
    }

    pub(crate) fn input(&self, device: &str, params: &Value) -> Result<Value, String> {
        let input_id = text(params, "inputId")?;
        identifier(input_id)?;
        let data = text(params, "data")?;
        if data.is_empty() || data.len() > 8192 {
            return Err("terminal input must be 1–8192 bytes".into());
        }
        let mut state = self.shared.lock();
        let session = state
            .sessions
            .get_mut(text(params, "sessionId")?)
            .ok_or("session not found")?;
        let native_id = authorized(session, device, params)?;
        let digest: [u8; 32] = Sha256::digest(data.as_bytes()).into();
        if let Some(previous) = session.inputs.get(input_id) {
            if previous != &digest {
                return Err("input ID was reused with different bytes".into());
            }
            return Ok(json!({"accepted":true,"inputId":input_id}));
        }
        if session.inputs.len() >= 65536 {
            return Err("session input receipt limit reached; start a new session".into());
        }
        self.ptys
            .write_input(native_id, data.as_bytes())
            .map_err(|e| e.to_string())?;
        // Queue acceptance, not proof the shell executed a command. On any lost
        // response clients must show uncertainty rather than invent a new ID.
        session.inputs.insert(input_id.into(), digest);
        Ok(json!({"accepted":true,"inputId":input_id}))
    }

    pub(crate) fn resize(&self, device: &str, params: &Value) -> Result<Value, String> {
        let dimension = |key| {
            params
                .get(key)
                .and_then(Value::as_u64)
                .filter(|value| (2..=500).contains(value))
                .map(|value| value as u16)
                .ok_or_else(|| format!("{key} must be between 2 and 500"))
        };
        let (cols, rows) = (dimension("cols")?, dimension("rows")?);
        let state = self.shared.lock();
        let id = authorized(state.session(text(params, "sessionId")?)?, device, params)?;
        self.ptys
            .resize(id, rows, cols)
            .map_err(|e| e.to_string())?;
        Ok(json!({"ok":true}))
    }

    pub(crate) fn release(&self, device: &str, params: &Value) -> Result<Value, String> {
        let mut state = self.shared.lock();
        let session = state
            .sessions
            .get_mut(text(params, "sessionId")?)
            .ok_or("session not found")?;
        if let Some(lease) = &session.lease {
            if lease.device != device || lease.token != text(params, "lease")? {
                return Err("terminal control belongs to another lease".into());
            }
            session.lease = None;
        }
        Ok(json!({"ok":true}))
    }
}
