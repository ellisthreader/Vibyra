use parking_lot::Mutex;
use std::{
    collections::{hash_map::DefaultHasher, HashMap, VecDeque},
    hash::{Hash, Hasher},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

pub const TYPING_OFF: &str =
    crate::platform_text::for_computer("Typing from your phone is off. Turn it on in Vibyra on your Mac: Settings > iPhone connection.", "Typing from your phone is off. Turn it on in Vibyra on your computer: Settings > iPhone connection.");
/// The phone's store matches this text to drop back to watching; keep them in step.
pub const LEASE_TAKEN: &str = "Another phone took this terminal. Tap it to type here again.";

/// How many recent input IDs each terminal remembers. A phone never retries on
/// its own; this only has to outlast a lost acknowledgement, not a session.
const RECEIPTS: usize = 256;

/// Whether a phone may type into this Mac's terminals, and which phone is.
///
/// Watching and typing are separate permissions. Every phone paired before
/// this existed was allowed under a prompt promising it could not type, and a
/// keystroke into a shell is any command this Mac's user could run — so typing
/// waits on its own switch, turned on here on the Mac and never from a phone.
///
/// Otherwise the rules match a standalone Host: one phone holds a terminal at a
/// time, every keystroke carries that phone's lease, and an input ID already
/// accepted is acknowledged again rather than typed twice. The Mac's own
/// keyboard holds no lease and is never refused.
///
/// Every phone here was trusted by this Mac's owner, so the newest to open a
/// terminal takes it: a phone left running on a desk — or a Simulator — must
/// never leave the one in the person's hand unable to type. The phone it was
/// taken from is told on its next keystroke and can tap to take it back.
pub struct Control {
    typing: Arc<AtomicBool>,
    terminals: Mutex<HashMap<u64, Terminal>>,
}

#[derive(Default)]
struct Terminal {
    lease: Option<Lease>,
    receipts: VecDeque<(String, u64)>,
}

struct Lease {
    device: String,
    token: String,
}
impl Lease {
    fn held_by(&self, device: &str, token: &str) -> bool {
        self.device == device && self.token == token
    }
}

impl Control {
    pub fn new(typing: Arc<AtomicBool>) -> Self {
        Self {
            typing,
            terminals: Mutex::default(),
        }
    }

    pub fn typing(&self) -> bool {
        self.typing.load(Ordering::SeqCst)
    }

    /// Hands `device` the terminal — taking it from another phone if one
    /// holds it — or the lease it already holds on it. `live` lists the
    /// terminals still open; ids are never reused, so the entry of one that
    /// closed is only waste.
    pub fn claim(&self, device: &str, id: u64, live: &[u64]) -> Result<String, String> {
        if !self.typing() {
            return Err(TYPING_OFF.into());
        }
        let mut terminals = self.terminals.lock();
        terminals.retain(|id, _| live.contains(id));
        let terminal = terminals.entry(id).or_default();
        if let Some(lease) = terminal.lease.as_ref().filter(|l| l.device == device) {
            return Ok(lease.token.clone());
        }
        let token = token()?;
        terminal.lease = Some(Lease {
            device: device.into(),
            token: token.clone(),
        });
        Ok(token)
    }

    /// Types `data` through `write` at most once per input ID.
    pub fn input(
        &self,
        device: &str,
        id: u64,
        lease: &str,
        input_id: &str,
        data: &str,
        write: impl FnOnce(&[u8]) -> Result<(), String>,
    ) -> Result<(), String> {
        if !self.typing() {
            return Err(TYPING_OFF.into());
        }
        let valid_id = |b: u8| b.is_ascii_alphanumeric() || b == b'-';
        if input_id.is_empty() || input_id.len() > 64 || !input_id.bytes().all(valid_id) {
            return Err("Invalid input ID".into());
        }
        if data.is_empty() || data.len() > 8192 {
            return Err("Terminal input must be 1–8192 bytes".into());
        }
        let digest = digest(data);
        {
            let mut terminals = self.terminals.lock();
            let terminal = terminals
                .get_mut(&id)
                .ok_or("Take control of this terminal first.")?;
            match terminal.lease.as_ref() {
                Some(l) if l.held_by(device, lease) => {}
                Some(l) if l.device != device => return Err(LEASE_TAKEN.into()),
                _ => return Err("Take control of this terminal first.".into()),
            }
            if let Some((_, seen)) = terminal.receipts.iter().find(|(seen, _)| seen == input_id) {
                return if *seen == digest {
                    Ok(())
                } else {
                    Err("Input ID was reused with different bytes".into())
                };
            }
            if terminal.receipts.len() == RECEIPTS {
                terminal.receipts.pop_front();
            }
            terminal.receipts.push_back((input_id.into(), digest));
        }
        // Written outside the lock: a program that stops reading its input can
        // hold a PTY write indefinitely, and nothing else a phone does — least
        // of all the disconnect that releases its lease — may wait on that.
        write(data.as_bytes()).inspect_err(|_| {
            // Never typed, so no receipt: the phone may send it again.
            if let Some(terminal) = self.terminals.lock().get_mut(&id) {
                terminal.receipts.retain(|(seen, _)| seen != input_id);
            }
        })
    }

    /// Gives the terminal back. Only the lease that holds it can.
    pub fn release(&self, device: &str, id: u64, lease: &str) {
        if let Some(terminal) = self.terminals.lock().get_mut(&id) {
            if terminal
                .lease
                .as_ref()
                .is_some_and(|l| l.held_by(device, lease))
            {
                terminal.lease = None;
            }
        }
    }

    /// A phone that leaves stops holding anything, so another can take over.
    pub fn disconnected(&self, device: &str) {
        for terminal in self.terminals.lock().values_mut() {
            if terminal.lease.as_ref().is_some_and(|l| l.device == device) {
                terminal.lease = None;
            }
        }
    }
}

fn token() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Tells a retried input from an ID reused for different bytes; a phone is a
/// trusted device, so this guards against mistakes rather than an attacker.
fn digest(data: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    data.hash(&mut hasher);
    hasher.finish()
}
