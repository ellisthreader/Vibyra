//! A slot remains occupied until its provider process and task context are reaped.
use super::execute::{Control, Outcome};
use std::{
    future::Future,
    sync::{atomic::Ordering, Arc},
};
use tokio::task::JoinHandle;
pub const SLOTS: usize = 3;
struct Job {
    id: String,
    control: Arc<Control>,
    handle: JoinHandle<Outcome>,
}
#[derive(Default)]
pub struct Pool {
    identity: Option<String>,
    jobs: [Option<Job>; SLOTS],
}
impl Pool {
    pub async fn bind(&mut self, identity: String) {
        if self.identity.as_ref() != Some(&identity) {
            self.stop().await;
            self.identity = Some(identity);
        }
    }
    pub fn available(&self) -> Vec<usize> {
        self.jobs
            .iter()
            .enumerate()
            .filter_map(|(i, j)| j.is_none().then_some(i))
            .collect()
    }
    pub fn active(&self) -> Vec<String> {
        self.jobs.iter().flatten().map(|j| j.id.clone()).collect()
    }
    pub fn start<F>(&mut self, slot: usize, id: String, control: Arc<Control>, task: F) -> bool
    where
        F: Future<Output = Outcome> + Send + 'static,
    {
        if slot >= SLOTS
            || self.jobs[slot].is_some()
            || self.jobs.iter().flatten().any(|j| j.id == id)
        {
            return false;
        }
        self.jobs[slot] = Some(Job {
            id,
            control,
            handle: tokio::spawn(task),
        });
        true
    }
    pub async fn reap(&mut self) -> Vec<Outcome> {
        let mut outcomes = Vec::new();
        for slot in &mut self.jobs {
            if slot.as_ref().is_some_and(|j| j.handle.is_finished()) {
                let job = slot.take().unwrap();
                outcomes.push(
                    job.handle
                        .await
                        .unwrap_or(Outcome::Failed("runner panicked".into())),
                );
            }
        }
        outcomes
    }
    pub async fn stop(&mut self) {
        self.cancel_all();
        for slot in &mut self.jobs {
            if let Some(job) = slot.take() {
                let _ = job.handle.await;
            }
        }
        self.identity = None;
    }
    fn cancel_all(&self) {
        for job in self.jobs.iter().flatten() {
            job.control.stale.store(true, Ordering::SeqCst);
        }
    }
}
impl Drop for Pool {
    fn drop(&mut self) {
        self.cancel_all();
    }
}
#[cfg(test)]
#[path = "pool_tests.rs"]
mod tests;
