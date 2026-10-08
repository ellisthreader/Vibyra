//! Forgetting projects the user closed: their cloud copy is removed, carefully.

use super::port::{Config, Env, Port};
use super::schedule::SWEEP_MS;
use super::worker::Worker;

const REMOVAL_GRACE_MS: u64 = SWEEP_MS;
pub(super) const PRUNE_EVERY_MS: u64 = 30_000;

impl<P: Port, E: Env> Worker<P, E> {
    pub(super) fn prune_removed(&mut self, cfg: &Config, now: u64) {
        for project in &cfg.projects {
            self.seen.insert(project.id.clone());
        }
        if now < self.prune_at {
            return;
        }
        self.prune_at = now + PRUNE_EVERY_MS;
        for known in self.port.known() {
            if cfg.projects.iter().any(|p| p.id == known.id) {
                self.absent_since.remove(&known.id);
                continue;
            }
            // An empty project list on a fresh start is a damaged settings file far more often than a
            // user who closed every project, and removal deletes cloud copies: never act on it.
            if cfg.projects.is_empty() && !self.seen.contains(&known.id) {
                continue;
            }
            let since = *self.absent_since.entry(known.id.clone()).or_insert(now);
            if now.saturating_sub(since) < REMOVAL_GRACE_MS {
                continue;
            }
            match self.port.remove(&known) {
                Ok(()) => {
                    self.port.forget(&known);
                    self.absent_since.remove(&known.id);
                    self.board.lock().projects.remove(&known.id);
                }
                Err(_) => {
                    self.absent_since.insert(known.id.clone(), now);
                }
            }
        }
    }
}
