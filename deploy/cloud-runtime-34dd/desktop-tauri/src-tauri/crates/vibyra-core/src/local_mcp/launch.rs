//! Starting a server: crash backoff, the failure cap, secrets read from the
//! keychain, the clean environment, and the handshake.

use super::conn::Conn;
use super::env::{build, find_program, not_found};
use super::error::McpError;
use super::handshake;
use super::slot::{fingerprint, Runtime, Slot, State};
use super::spec::ServerSpec;
use super::supervisor::Supervisor;
use std::collections::BTreeMap;
use std::time::{Duration, Instant};

impl Supervisor {
    pub(super) fn ensure_started(
        &self,
        spec: &ServerSpec,
        slot: &Slot,
        run: &mut Runtime,
    ) -> Result<(), McpError> {
        let print = fingerprint(spec);
        if run.conn.as_mut().is_some_and(|c| !c.alive()) {
            // Gone while idle (killed, out of memory): not a failure of this call, so no backoff.
            run.stop(slot);
            slot.set(|s| {
                s.last_error = Some("The server had exited; it was started again.".into())
            });
        }
        if run.conn.is_some() && run.fingerprint == print {
            return Ok(());
        }
        if run.conn.is_some() {
            run.stop(slot); // launched differently: start over
        }
        if run.failures >= self.limits.max_failures {
            return Err(unavailable(
                None,
                format!(
                    "This server stopped {} times in a row. Fix it, then retry from Settings.",
                    run.failures
                ),
            ));
        }
        if let Some(wait) = run.remaining_backoff() {
            return Err(unavailable(
                Some(wait),
                format!(
                    "This server stopped working a moment ago; it can start again in {} seconds.",
                    wait.as_secs() + 1
                ),
            ));
        }
        slot.set(|s| s.state = State::Starting);
        match self.start(spec) {
            Ok(conn) => {
                slot.running(&conn.era);
                run.conn = Some(conn);
                run.fingerprint = print;
                run.last_used = Some(Instant::now());
                slot.set(|s| s.last_error = None);
                Ok(())
            }
            Err(error) => {
                run.fail(slot, &self.limits, error.to_string());
                Err(error)
            }
        }
    }

    fn start(&self, spec: &ServerSpec) -> Result<Conn, McpError> {
        let mut secrets = BTreeMap::new();
        for name in &spec.secret_env {
            match self
                .secrets
                .read(&spec.id, name)
                .map_err(McpError::Secret)?
            {
                Some(value) => secrets.insert(name.clone(), value),
                None => {
                    return Err(McpError::Secret(format!(
                        "{name} is not saved on this Mac. Open the server and enter it again."
                    )))
                }
            };
        }
        let env = build(spec, &(self.env)(), &secrets);
        let program =
            find_program(&spec.command, &env).ok_or_else(|| not_found(spec.command.trim()))?;
        let hidden: Vec<String> = secrets.into_values().collect();
        let spawn = || {
            Conn::spawn(
                &program,
                spec,
                env.clone(),
                self.limits.clone(),
                hidden.clone(),
            )
        };
        let mut conn = spawn()?;
        let era = match handshake::run(&mut conn) {
            // Some legacy SDKs exit on any request before initialize. Restart
            // once with the legacy handshake; never repeat a tool invocation.
            Err(McpError::Crashed(_)) => {
                conn.stop();
                conn = spawn()?;
                handshake::legacy_start(&mut conn)?
            }
            outcome => outcome?,
        };
        conn.era = era;
        Ok(conn)
    }
}

fn unavailable(retry_after: Option<Duration>, detail: String) -> McpError {
    McpError::Unavailable {
        retry_after,
        detail,
    }
}
