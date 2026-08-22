use std::process::{Command, Stdio};
use std::sync::Arc;

use parking_lot::Mutex;

use crate::provider_auth_attempt::LoginAttemptStore;
use crate::provider_auth_home::AccountHome;
use crate::provider_auth_output::{capture, ProcessOutput};
use crate::provider_auth_probe::{key, targets, ProbeCache};
use crate::provider_auth_process::prepare_child;
use crate::provider_auth_registry::{Registry, MAX_PER_PROVIDER};
use crate::provider_auth_state::{definition, installed, ProviderView};
use crate::provider_auth_url::open;

/// Connect, install and disconnect live next door. They are a child module
/// rather than a sibling so they can still reach this type's own fields, and
/// splitting them keeps both files inside the 200-line limit.
#[path = "provider_auth_actions.rs"]
mod actions;

#[derive(Default)]
pub struct ProviderAuthManager {
    attempts: LoginAttemptStore,
    probes: Mutex<ProbeCache>,
}

impl ProviderAuthManager {
    /// Every provider, each with every account held for it.
    pub fn accounts(&self) -> Vec<ProviderView> {
        self.view(None)
    }

    /// The same, having just re-asked one account. Used after an action whose
    /// whole point is that the answer should have changed, so it must not be
    /// served from the probe cache.
    fn view(&self, force: Option<&str>) -> Vec<ProviderView> {
        if self.attempts.take_finished_install() {
            // The package landed in a directory that may not have existed —
            // and so was not on PATH — when the app started.
            vibyra_core::launch_env::user_path::install();
        }
        let registry = Registry::load();
        let targets = targets(&registry);
        // An account with a sign-in running, and the one just acted on, are
        // asked again every time: those are the answers expected to change.
        let mut forced = self.attempts.active_ids();
        forced.extend(force.map(str::to_string));
        let snapshots = self.probes.lock().refresh(&targets, &forced);

        let mut views: Vec<ProviderView> = Vec::new();
        for target in &targets {
            let id = key(target.provider.id, &target.account_id);
            let auth = snapshots.get(&id).cloned().unwrap_or_default();
            if auth.connected {
                self.attempts.finish_connected(&id);
            }
            let available = installed(target.provider);
            let row = crate::provider_auth_view::build(
                target.provider,
                &target.account_id,
                available,
                auth,
                self.attempts.view(&id),
            );
            match views.last_mut() {
                Some(view) if view.id == target.provider.id => view.accounts.push(row),
                _ => views.push(ProviderView {
                    id: target.provider.id.into(),
                    company: target.provider.company.into(),
                    product: target.provider.product.into(),
                    runtime_id: target.provider.runtime_id.into(),
                    installed: available,
                    package: target.provider.package.into(),
                    accounts: vec![row],
                    can_add_account: false,
                }),
            }
        }
        for view in &mut views {
            view.can_add_account = view.installed && view.accounts.len() < MAX_PER_PROVIDER;
        }
        views
    }

    /// Adds an empty account and starts its sign-in straight away.
    ///
    /// One step rather than two: an account with no login is not a thing the
    /// user asked for, and leaving one behind if the sign-in is abandoned is
    /// the sort of debris they would then have to clean up.
    pub fn add_account(&self, provider_id: &str) -> Result<Vec<ProviderView>, String> {
        let provider = definition(provider_id).ok_or_else(unknown_provider)?;
        if !installed(provider) {
            return Err(format!("Install {} before connecting.", provider.product));
        }
        let mut registry = Registry::load();
        let account_id = registry.add(provider_id)?;
        self.connect(provider_id, &account_id)
    }

    /// Signs an account out, then forgets it and deletes its folder.
    ///
    /// Signing out first is what keeps the provider's own record straight: a
    /// deleted folder would leave the session live at their end with nothing
    /// here able to end it.
    pub fn remove_account(
        &self,
        provider_id: &str,
        account_id: &str,
    ) -> Result<Vec<ProviderView>, String> {
        definition(provider_id).ok_or_else(unknown_provider)?;
        let _ = self.disconnect(provider_id, account_id);
        let mut registry = Registry::load();
        registry.remove(provider_id, account_id)?;
        self.attempts.cancel(&key(provider_id, account_id));
        self.probes.lock().forget(&key(provider_id, account_id));
        Ok(self.accounts())
    }

    pub fn open_sign_in_page(&self, provider_id: &str, account_id: &str) -> Result<(), String> {
        definition(provider_id).ok_or_else(unknown_provider)?;
        let url = self
            .attempts
            .sign_in_url(&key(provider_id, account_id))
            .filter(|url| !url.is_empty())
            .ok_or_else(|| "Start account authorization first.".to_string())?;
        open(&url)
    }

    /// Answers whatever the provider CLI is asking. Every sign-in that ends by
    /// handing the user a code to paste needs this; without it the attempt can
    /// only ever time out.
    pub fn submit(
        &self,
        provider_id: &str,
        account_id: &str,
        value: &str,
    ) -> Result<Vec<ProviderView>, String> {
        definition(provider_id).ok_or_else(unknown_provider)?;
        self.attempts.submit(&key(provider_id, account_id), value)?;
        Ok(self.accounts())
    }

    pub fn cancel(&self, provider_id: &str, account_id: &str) -> Result<Vec<ProviderView>, String> {
        definition(provider_id).ok_or_else(unknown_provider)?;
        self.attempts.cancel(&key(provider_id, account_id));
        Ok(self.view(Some(&key(provider_id, account_id))))
    }

    /// Resolves one account's folder, refusing ids the registry never issued.
    fn home(&self, provider_id: &str, account_id: &str) -> Result<AccountHome, String> {
        Registry::load().home(provider_id, account_id)
    }

    /// Starts a tracked child and watches both of its streams.
    ///
    /// stdin stays a live pipe for every provider: it is what lets the reply
    /// box answer a question later, and a sign-in wired to `/dev/null` can
    /// only hang once the CLI asks one.
    fn spawn(
        &self,
        id: &str,
        installing: bool,
        mut command: Command,
        failure: String,
    ) -> Result<Vec<ProviderView>, String> {
        command.current_dir(dirs::home_dir().unwrap_or_else(std::env::temp_dir));
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        prepare_child(&mut command);
        let mut child = command
            .spawn()
            .map_err(|error| format!("{failure}: {error}"))?;
        let output: Arc<Mutex<ProcessOutput>> = Arc::default();
        if let Some(stdout) = child.stdout.take() {
            capture(stdout, Arc::clone(&output));
        }
        if let Some(stderr) = child.stderr.take() {
            capture(stderr, Arc::clone(&output));
        }
        self.attempts.start(id, installing, child, output);
        Ok(self.view(Some(id)))
    }
}

fn unknown_provider() -> String {
    "Unknown AI account provider.".to_string()
}
