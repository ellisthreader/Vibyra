use super::{json, request, Target, Value};
use parking_lot::Mutex;
use std::{
    collections::HashSet,
    sync::{Arc, OnceLock},
    time::{Duration, Instant},
};

fn leases() -> &'static Mutex<HashSet<u32>> {
    static LEASES: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();
    LEASES.get_or_init(Default::default)
}

pub(crate) struct Session {
    decoded: std::sync::atomic::AtomicBool,
    target: Target,
    token: Mutex<Option<String>>,
    seen: Mutex<Instant>,
    sequence: Mutex<u64>,
}
impl Session {
    pub fn can_control(&self) -> bool {
        self.target.control
    }
    pub fn start(target: Target) -> Result<Arc<Self>, String> {
        let info = target.info()?;
        if target.control && !leases().lock().insert(target.id) {
            return Err(
                "Another phone is controlling this window. Close its Preview first.".into(),
            );
        }
        let opened = request(json!({"op":"start","id":target.id,"fingerprint":info.fingerprint}));
        let token = opened.and_then(|bytes| {
            let value: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            value["session"]
                .as_str()
                .map(str::to_owned)
                .ok_or("Missing window session".into())
        });
        let token = match token {
            Ok(token) => token,
            Err(error) => {
                if target.control {
                    leases().lock().remove(&target.id);
                }
                return Err(error);
            }
        };
        let session = Arc::new(Self {
            decoded: std::sync::atomic::AtomicBool::new(false),
            target,
            token: Mutex::new(Some(token)),
            seen: Mutex::new(Instant::now()),
            sequence: Mutex::new(0),
        });
        let weak = Arc::downgrade(&session);
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_secs(1));
            let Some(session) = weak.upgrade() else {
                break;
            };
            if session.seen.lock().elapsed() > Duration::from_secs(10) {
                session.close();
                break;
            }
        });
        Ok(session)
    }
    pub fn frame(&self) -> Result<Vec<u8>, String> {
        // Copied out so a long key batch never holds frames back.
        let token = self.token.lock().clone();
        let token = token.ok_or("Window Preview ended. Reopen it.")?;
        *self.seen.lock() = Instant::now();
        let result = request(json!({"op":"frame","session":token}));
        if result.is_err() {
            self.decoded
                .store(false, std::sync::atomic::Ordering::Release);
        }
        result
    }
    pub fn decoded(&self) {
        self.decoded
            .store(true, std::sync::atomic::Ordering::Release);
    }
    pub fn ready(&self) -> bool {
        self.decoded.load(std::sync::atomic::Ordering::Acquire)
            && self.token.lock().is_some()
            && self.seen.lock().elapsed() < Duration::from_secs(10)
    }
    /// Keyboard focus in the window, which lets the phone raise its own
    /// keyboard. Only a phone that may type is told.
    pub fn focus(&self) -> Option<Value> {
        if !self.target.control {
            return None;
        }
        let token = self.token.lock().clone()?;
        let bytes = request(json!({"op":"focus","session":token})).ok()?;
        serde_json::from_slice(&bytes).ok()
    }
    /// Sends one input and returns the keyboard focus after it.
    pub fn input(&self, mut event: Value) -> Result<Value, String> {
        if !self.target.control {
            return Err("This window is shared for viewing only.".into());
        }
        let token = self.token.lock().clone();
        let token = token.ok_or("Window Preview ended.")?;
        // Held for the whole input, so inputs reach the window one at a time.
        let mut sequence = self.sequence.lock();
        let next = event["sequence"].as_u64().ok_or("Invalid input sequence")?;
        // Strictly increasing: a lost request is skipped, never replayed or reordered.
        if next <= *sequence {
            return Err("Window input arrived out of order. Try again.".into());
        }
        *sequence = next;
        event["op"] = json!("input");
        event["session"] = json!(token);
        let reply = request(event)?;
        *self.seen.lock() = Instant::now();
        let reply: Value = serde_json::from_slice(&reply).unwrap_or_default();
        Ok(reply["focus"].clone())
    }
    pub fn close(&self) {
        if let Some(token) = self.token.lock().take() {
            let _ = request(json!({"op":"stop","session":token}));
            if self.target.control {
                leases().lock().remove(&self.target.id);
            }
        }
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        self.close();
    }
}
