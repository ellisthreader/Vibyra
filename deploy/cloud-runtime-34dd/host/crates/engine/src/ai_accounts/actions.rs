//! The things a phone does to the account: start a sign-in, answer it, sign out.
use super::{
    output::{capture, ProcessOutput},
    probe, Manager, Provider,
};
use parking_lot::Mutex;
use std::{process::Stdio, sync::Arc};

impl Manager {
    pub(super) fn connect(&self, provider: &Provider) -> Result<(), String> {
        let program = self
            .env
            .find(provider.program)
            .ok_or_else(|| format!("{} is not installed on this computer.", provider.product))?;
        let mut command = self.env.command(&program);
        // A phone has no browser on this computer, so Codex uses its device code.
        match provider.id {
            "codex" => command.args(["login", "--device-auth"]),
            _ => command.args(["auth", "login", "--claudeai"]),
        };
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // Its own group, so a cancel reaches whatever the CLI started too.
        vibyra_core::process_group::isolate(&mut command);
        let mut child = command
            .spawn()
            .map_err(|e| format!("Could not start {} sign-in: {e}", provider.company))?;
        let output: Arc<Mutex<ProcessOutput>> = Arc::default();
        if let Some(stdout) = child.stdout.take() {
            capture(stdout, Arc::clone(&output));
        }
        if let Some(stderr) = child.stderr.take() {
            capture(stderr, Arc::clone(&output));
        }
        self.probes.lock().remove(provider.id);
        self.attempts.start(provider.id, child, output);
        Ok(())
    }

    pub(super) fn submit(&self, provider: &Provider, value: &str) -> Result<(), String> {
        let value = value.trim();
        if value.is_empty() || value.len() > 4096 || value.chars().any(char::is_control) {
            return Err("Enter the requested sign-in answer.".into());
        }
        self.attempts.submit(provider.id, value)
    }

    pub(super) fn disconnect(&self, provider: &Provider) -> Result<(), String> {
        self.attempts.finish(provider.id);
        self.probes.lock().remove(provider.id);
        if let Some(program) = self.env.find(provider.program) {
            let args: &[&str] = if provider.id == "codex" {
                &["logout"]
            } else {
                &["auth", "logout"]
            };
            probe::run(&self.env, &program, args);
            if self.auth(provider, true).connected {
                return Err(format!(
                    "{} still reports a connected account.",
                    provider.company
                ));
            }
        }
        Ok(())
    }
}
