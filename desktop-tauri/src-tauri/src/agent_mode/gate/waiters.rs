//! Blocking on a person.
//!
//! A card is answered on the UI thread and awaited on a gate thread; this is
//! the handshake between them. The database row is the truth and is polled
//! as a net, so an answer given by anything other than `notify` — a cancelled
//! turn invalidating its cards, for instance — still ends the wait.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::{Condvar, Mutex};

use crate::agent_mode::hub::AgentWorld;

/// How a wait ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Approved,
    Denied,
    /// The turn was stopped, or the card invalidated, before anyone answered.
    Cancelled,
    TimedOut,
}

struct Slot {
    answer: Mutex<Option<bool>>,
    changed: Condvar,
}

static WAITING: Mutex<Option<HashMap<String, Arc<Slot>>>> = Mutex::new(None);

fn slot_for(card_id: &str) -> Arc<Slot> {
    let mut waiting = WAITING.lock();
    waiting
        .get_or_insert_with(HashMap::new)
        .entry(card_id.to_string())
        .or_insert_with(|| {
            Arc::new(Slot {
                answer: Mutex::new(None),
                changed: Condvar::new(),
            })
        })
        .clone()
}

/// Wakes the gate thread waiting on `card_id`, if any.
pub fn notify(card_id: &str, approved: bool) {
    let slot = WAITING
        .lock()
        .as_ref()
        .and_then(|waiting| waiting.get(card_id).cloned());
    if let Some(slot) = slot {
        *slot.answer.lock() = Some(approved);
        slot.changed.notify_all();
    }
}

/// Blocks until the card is answered, the turn stops, or `patience` runs out.
pub fn wait(world: &AgentWorld, chat_id: &str, card_id: &str, patience: Duration) -> Verdict {
    let slot = slot_for(card_id);
    let started = Instant::now();
    let verdict = loop {
        let mut answer = slot.answer.lock();
        if let Some(approved) = *answer {
            break if approved {
                Verdict::Approved
            } else {
                Verdict::Denied
            };
        }
        match vibyra_core::approvals::get(&world.db, &world.account, card_id)
            .map(|card| card.state)
            .as_deref()
        {
            Ok("approved") => break Verdict::Approved,
            Ok("denied") => break Verdict::Denied,
            Ok("invalidated") => break Verdict::Cancelled,
            _ => {}
        }
        if world.is_cancelled(chat_id) {
            break Verdict::Cancelled;
        }
        if started.elapsed() >= patience {
            break Verdict::TimedOut;
        }
        slot.changed
            .wait_for(&mut answer, Duration::from_millis(500));
    };
    if let Some(waiting) = WAITING.lock().as_mut() {
        waiting.remove(card_id);
    }
    verdict
}
