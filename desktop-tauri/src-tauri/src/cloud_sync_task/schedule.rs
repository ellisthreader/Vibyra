//! When to sync, as pure logic over a caller-supplied clock (milliseconds), so the
//! debounce, sweep, poll, backoff and one-at-a-time rules are unit tests instead of
//! timing luck. The worker owns the clock and the actual work; this only decides.

use std::collections::BTreeMap;

pub use super::schedule_types::*;

#[derive(Debug, Default, Clone)]
pub(super) struct Slot {
    pub(super) due: Option<u64>,
    pub(super) first_dirty: Option<u64>,
    pub(super) failures: u32,
    pub(super) retry_at: u64,
    pub(super) generation: u64,
    pub(super) running_generation: u64,
}

#[derive(Debug)]
pub struct Scheduler {
    pub(super) slots: BTreeMap<String, Slot>,
    pub(super) sweep_at: u64,
    pub(super) poll_at: u64,
    pub(super) poll_failures: u32,
    pub(super) pause_until: u64,
    pub(super) global_failures: u32,
    pub(super) busy: bool,
}

impl Scheduler {
    pub fn new(now: u64) -> Self {
        Scheduler {
            slots: BTreeMap::new(),
            sweep_at: now + SWEEP_MS,
            poll_at: now,
            poll_failures: 0,
            pause_until: 0,
            global_failures: 0,
            busy: false,
        }
    }

    /// Replaces the set of projects being kept up to date. A new project is due
    /// at once; one that went away is forgotten.
    pub fn set_projects(&mut self, ids: &[String], now: u64) {
        self.slots.retain(|id, _| ids.contains(id));
        for id in ids {
            self.slots.entry(id.clone()).or_insert_with(|| Slot {
                due: Some(now),
                ..Slot::default()
            });
        }
    }

    pub fn forget_all(&mut self) {
        self.slots.clear();
    }

    /// A file changed: upload after `DEBOUNCE_MS` of quiet, at the latest `MAX_WAIT_MS` after the first change.
    pub fn changed(&mut self, id: &str, now: u64) {
        let Some(slot) = self.slots.get_mut(id) else {
            return;
        };
        let first = *slot.first_dirty.get_or_insert(now);
        slot.generation += 1;
        slot.due = Some((now + DEBOUNCE_MS).min(first + MAX_WAIT_MS));
    }

    /// Focus loss, quit: whatever changed and has not gone up yet goes now (a backed-off project still waits).
    pub fn flush_dirty(&mut self, now: u64) {
        for slot in self.slots.values_mut().filter(|s| s.due.is_some()) {
            slot.due = Some(now);
        }
    }

    /// "Sync now": one project or all, ignoring any backoff.
    pub fn sync_now(&mut self, id: Option<&str>, now: u64) {
        self.pause_until = 0;
        for (key, slot) in &mut self.slots {
            if id.is_none_or(|wanted| wanted == key) {
                slot.due = Some(now);
                slot.retry_at = 0;
            }
        }
    }

    /// The machine woke or the user came back: look at everything, forget old failures.
    pub fn wake(&mut self, now: u64) {
        self.pause_until = 0;
        self.global_failures = 0;
        self.poll_at = now;
        self.sweep_at = now;
        for slot in self.slots.values_mut() {
            slot.retry_at = 0;
            if slot.failures > 0 {
                slot.due = Some(now);
            }
        }
    }

    /// A new sign-in or a settings change: lift an auth pause.
    pub fn resume(&mut self) {
        self.pause_until = 0;
    }

    pub fn is_paused(&self, now: u64) -> bool {
        now < self.pause_until
    }

    pub fn has_due(&self, now: u64) -> bool {
        self.slots.values().any(|s| s.due.is_some_and(|d| d <= now))
    }

    #[cfg(test)]
    pub fn is_dirty(&self, id: &str) -> bool {
        self.slots.get(id).is_some_and(|s| s.due.is_some())
    }

    #[cfg(test)]
    pub fn failures(&self, id: &str) -> u32 {
        self.slots.get(id).map_or(0, |s| s.failures)
    }

    pub fn retry_at(&self, id: &str) -> Option<u64> {
        self.slots.get(id).map(|s| s.retry_at).filter(|t| *t > 0)
    }

    /// Defers one project (for example while the cloud computer has no key yet).
    pub fn defer(&mut self, id: &str, until: u64) {
        if let Some(slot) = self.slots.get_mut(id) {
            slot.due = Some(until);
        }
    }

    pub fn next(&mut self, now: u64) -> Action {
        if now >= self.sweep_at {
            self.sweep_at = now + SWEEP_MS;
            for slot in self.slots.values_mut() {
                slot.due.get_or_insert(now);
            }
        }
        if self.busy {
            return Action::Idle(1_000);
        }
        if now < self.pause_until {
            return Action::Idle(self.pause_until - now);
        }
        let ready = |slot: &Slot| slot.due.filter(|d| *d <= now && slot.retry_at <= now);
        let pick = self
            .slots
            .iter()
            .filter_map(|(id, slot)| ready(slot).map(|due| (due, id)))
            .min();
        if let Some((_, id)) = pick {
            return Action::Sync(id.clone());
        }
        if now >= self.poll_at {
            return Action::Poll;
        }
        let mut wait = self.poll_at.min(self.sweep_at);
        for slot in self.slots.values() {
            if let Some(due) = slot.due {
                wait = wait.min(due.max(slot.retry_at));
            }
        }
        Action::Idle(wait.saturating_sub(now).max(1))
    }
}
