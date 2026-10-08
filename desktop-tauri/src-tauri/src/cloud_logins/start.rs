use super::{run, CloudLogins, Job, PROVIDERS};
use crate::commands::cloud_management_guard::ManagementSession;
use std::sync::{atomic::AtomicBool, Arc};
use tauri::{AppHandle, Manager};

impl CloudLogins {
    pub fn start(
        self: &Arc<Self>,
        app: AppHandle,
        session: ManagementSession,
        provider: &str,
    ) -> Result<(), String> {
        let id = PROVIDERS
            .iter()
            .copied()
            .find(|p| *p == provider)
            .ok_or("Choose Claude or Codex.")?;
        session.check(&app.state::<crate::state::AppState>())?;
        let (generation, cancel) = {
            let mut inner = self.lock();
            inner.scope(&session.token, session.epoch);
            if inner.job.is_some() {
                return Err("Finish or stop the current Cloud sign-in first.".into());
            }
            inner.generation = inner.generation.wrapping_add(1);
            let generation = inner.generation;
            let cancel = Arc::new(AtomicBool::new(false));
            inner.job = Some(Job {
                generation,
                cancel: Arc::clone(&cancel),
            });
            (generation, cancel)
        };
        let logins = Arc::clone(self);
        let owner = session.token.clone();
        let epoch = session.epoch;
        let started = std::thread::Builder::new()
            .name("cloud-login".into())
            .spawn(move || {
                let result = run::login(&app, &logins, &session, id, generation, &cancel);
                let mut inner = logins.lock();
                if inner
                    .job
                    .as_ref()
                    .is_some_and(|j| j.generation == generation)
                {
                    inner.job = None;
                }
                drop(inner);
                if session
                    .check(&app.state::<crate::state::AppState>())
                    .is_ok()
                {
                    match result {
                        Ok(state) => logins.set(&app, &session, generation, id, state, None),
                        Err(error) => {
                            logins.set(&app, &session, generation, id, "error", Some(error))
                        }
                    }
                } else {
                    logins.lock().cancel_generation(generation);
                }
            });
        if started.is_err() {
            let mut inner = self.lock();
            if inner.current(&owner, epoch, generation) {
                inner.job = None;
            }
            return Err("Cloud sign-in could not start. Try again.".into());
        }
        Ok(())
    }
}
